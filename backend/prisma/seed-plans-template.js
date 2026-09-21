import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter,
});

const PLAN_TEMPLATES_FILE = "plan-templates.json";

function readPlanTemplatesJson() {
  const filePath = path.join(
    process.cwd(),
    "prisma",
    "seed-data",
    PLAN_TEMPLATES_FILE
  );

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Plan templates seed file not found: ${filePath}`
    );
  }

  const json = fs.readFileSync(filePath, "utf8");

  let templates;

  try {
    templates = JSON.parse(json);
  } catch {
    throw new Error(
      `Invalid JSON in ${PLAN_TEMPLATES_FILE}.`
    );
  }

  if (!Array.isArray(templates)) {
    throw new Error(
      `${PLAN_TEMPLATES_FILE} must contain an array of plan templates.`
    );
  }

  return templates;
}

function validatePlanTemplate(template) {
  if (!template.id) {
    throw new Error(
      "Plan template is missing id."
    );
  }

  if (!template.name) {
    throw new Error(
      `Plan template "${template.id}" is missing name.`
    );
  }

  if (!template.goalType) {
    throw new Error(
      `Plan template "${template.name}" is missing goalType.`
    );
  }

  if (!template.experienceLevel) {
    throw new Error(
      `Plan template "${template.name}" is missing experienceLevel.`
    );
  }

  if (!Array.isArray(template.days)) {
    throw new Error(
      `Plan template "${template.name}" must contain a days array.`
    );
  }

  const dayNumbers = new Set();

  for (const day of template.days) {
    if (!day.id) {
      throw new Error(
        `Template "${template.name}" has a day missing id.`
      );
    }

    if (!Number.isInteger(day.dayNumber)) {
      throw new Error(
        `Template "${template.name}" has an invalid dayNumber.`
      );
    }

    if (dayNumbers.has(day.dayNumber)) {
      throw new Error(
        `Template "${template.name}" has duplicate dayNumber ${day.dayNumber}.`
      );
    }

    dayNumbers.add(day.dayNumber);

    if (!day.name) {
      throw new Error(
        `Template "${template.name}" day ${day.dayNumber} is missing name.`
      );
    }

    if (
      day.workoutBlueprint == null ||
      typeof day.workoutBlueprint !== "object" ||
      Array.isArray(day.workoutBlueprint)
    ) {
      throw new Error(
        `Template "${template.name}" day ${day.dayNumber} has an invalid workoutBlueprint.`
      );
    }

    if (
      day.nutritionBlueprint != null &&
      (
        typeof day.nutritionBlueprint !== "object" ||
        Array.isArray(day.nutritionBlueprint)
      )
    ) {
      throw new Error(
        `Template "${template.name}" day ${day.dayNumber} has an invalid nutritionBlueprint.`
      );
    }
  }
}

function validateSeedData(templates) {
  const templateIds = new Set();

  for (const template of templates) {
    validatePlanTemplate(template);

    if (templateIds.has(template.id)) {
      throw new Error(
        `Duplicate plan template id: ${template.id}`
      );
    }

    templateIds.add(template.id);
  }
}

async function seedPlanTemplates() {
  const templates = readPlanTemplatesJson();

  validateSeedData(templates);

  const totalDays = templates.reduce(
    (total, template) =>
      total + template.days.length,
    0
  );

  console.log(
    `Found ${templates.length} plan templates and ${totalDays} template days in ${PLAN_TEMPLATES_FILE}.`
  );

  let templatesCreated = 0;
  let templatesUpdated = 0;

  let daysCreated = 0;
  let daysUpdated = 0;
  let daysDeleted = 0;

  for (const [
    templateIndex,
    template,
  ] of templates.entries()) {
    await prisma.$transaction(async (tx) => {
      // ==================================================
      // PLAN TEMPLATE
      // ==================================================

      const existingTemplate =
        await tx.planTemplate.findUnique({
          where: {
            id: template.id,
          },
          select: {
            id: true,
          },
        });

      if (existingTemplate) {
        await tx.planTemplate.update({
          where: {
            id: template.id,
          },
          data: {
            name: template.name,

            description:
              template.description ?? null,

            goalType:
              template.goalType,

            experienceLevel:
              template.experienceLevel,

            durationWeeks:
              template.durationWeeks ?? null,
          },
        });

        templatesUpdated++;
      } else {
        await tx.planTemplate.create({
          data: {
            id:
              template.id,

            name:
              template.name,

            description:
              template.description ?? null,

            goalType:
              template.goalType,

            experienceLevel:
              template.experienceLevel,

            durationWeeks:
              template.durationWeeks ?? null,
          },
        });

        templatesCreated++;
      }

      // ==================================================
      // REMOVE DAYS THAT NO LONGER EXIST IN JSON
      // ==================================================

      const validDayNumbers =
        template.days.map(
          (day) => day.dayNumber
        );

      const deleted =
        await tx.planTemplateDay.deleteMany({
          where: {
            planTemplateId:
              template.id,

            dayNumber: {
              notIn: validDayNumbers,
            },
          },
        });

      daysDeleted += deleted.count;

      // ==================================================
      // PLAN TEMPLATE DAYS
      // ==================================================

      for (const day of template.days) {
        const existingDay =
          await tx.planTemplateDay.findUnique({
            where: {
              planTemplateId_dayNumber: {
                planTemplateId:
                  template.id,

                dayNumber:
                  day.dayNumber,
              },
            },
            select: {
              id: true,
            },
          });

        if (existingDay) {
          await tx.planTemplateDay.update({
            where: {
              id: existingDay.id,
            },

            data: {
              name:
                day.name,

              workoutBlueprint:
                day.workoutBlueprint,

              nutritionBlueprint:
                day.nutritionBlueprint ?? null,

              notes:
                day.notes ?? null,
            },
          });

          daysUpdated++;
        } else {
          await tx.planTemplateDay.create({
            data: {
              id:
                day.id,

              planTemplateId:
                template.id,

              dayNumber:
                day.dayNumber,

              name:
                day.name,

              workoutBlueprint:
                day.workoutBlueprint,

              nutritionBlueprint:
                day.nutritionBlueprint ?? null,

              notes:
                day.notes ?? null,
            },
          });

          daysCreated++;
        }
      }
    });

    console.log(
      `Processed ${templateIndex + 1}/${templates.length}: ${template.name}`
    );
  }

  console.log();
  console.log("Plan template seed complete.");

  console.log();
  console.log("Plan templates:");
  console.log(
    `Created: ${templatesCreated}`
  );
  console.log(
    `Updated: ${templatesUpdated}`
  );
  console.log(
    `Total:   ${templates.length}`
  );

  console.log();
  console.log("Plan template days:");
  console.log(
    `Created: ${daysCreated}`
  );
  console.log(
    `Updated: ${daysUpdated}`
  );
  console.log(
    `Deleted: ${daysDeleted}`
  );
  console.log(
    `Total:   ${totalDays}`
  );
}

seedPlanTemplates()
  .catch((error) => {
    console.error(
      "Plan template seed failed:"
    );

    console.error(error);

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
