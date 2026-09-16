import { prisma } from "../../lib/prisma.js";


export async function findCompatibleTemplate({
  goalType,
  experienceLevel,
  db = prisma,
}) {
  return db.planTemplate.findFirst({
    where: {
      goalType,
      experienceLevel,
    },
    // The current model has no version/isActive fields. Keep selection stable
    // if more than one template has the same goal and experience level.
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    include: {
      days: {
        orderBy: {
          dayNumber: "asc",
        },
      },
    },
  });
}
