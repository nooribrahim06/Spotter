# Spotter — MVP User Journey

The core journey is to set a fitness goal, receive a personalized AI-generated
workout and nutrition plan, follow it, and track actual activity and progress.
Human coaches will be able to create plans in a future release.

## 1. Account

- Sign up for a new account.
- Log in to an existing account.
- Log out of the account.

## 2. Body Profile

- Create a body profile with:
  - Age and gender.
  - Height and weight.
  - Body measurements.
  - Health information.
  - Activity level.
  - Dietary preferences.
- View the body profile.
- Update the body profile.
- Delete the body profile.
- View the calculated daily calorie target.
- View the calculated protein, carbohydrate, and fat targets.

## 3. Fitness Goals

- Create a fitness goal.
- View the active goal.
- Update the active goal.
- Mark the active goal as completed.
- View previous goals.

## 4. Personalized Plan

- Request an AI-generated weekly workout and nutrition plan based on:
  - The body profile and active fitness goal.
  - Current calorie and macro targets.
  - Health information and stated limitations.
  - Dietary preferences, allergies, and food restrictions.
  - Training experience, available equipment, available days, and session length.
  - Available progress history and logged meals and workouts.
- Provide any missing information needed to generate the plan.
- Review the generated plan before activating it, including:
  - Its start date and weekly schedule.
  - Workout days, rest days, exercises, sets, repetitions, and duration where applicable.
  - Suggested meals, portions, calories, and macros for each day.
  - A short explanation of how the plan supports the active goal.
- Activate one plan at a time.
- View the active plan and today's planned meals and workout or rest day.
- Request changes, review a revised plan, and choose whether to activate it.
- Keep the current plan available if generating a replacement fails.
- View previous plans and identify which plan was followed at the time.
- Preserve existing logs and progress when a plan is revised or replaced.
- See that the plan was created by AI.

## 5. Meal Tracking

- Log a planned meal, adjusting foods and quantities to what was actually eaten.
- Log a meal manually with its foods, quantities, calories, and macros.
- Keep planned meals separate from consumed totals until they are logged.
- View today's meals.
- View meal history.
- Edit a logged meal.
- Delete a logged meal.

## 6. Workout Tracking

- Start a workout from the active plan and record the exercises actually performed.
- Log a workout manually with its exercises, sets, repetitions, weights, and duration.
- Adjust the actual session without changing the original planned workout.
- Keep planned workouts separate from completed activity until they are logged.
- View today's workouts.
- View workout history.
- Edit a logged workout.
- Delete a logged workout.

## 7. Daily Summary

- View today's planned meals and workout or rest day.
- Compare logged activity with today's plan.
- View today's calorie target.
- View calories consumed.
- View calories burned.
- View calories remaining.
- View protein, carbohydrate, and fat progress against their targets.
- View the number of meals and workouts logged today.
- View whether today's workout was completed.
- View previous daily summaries.

## 8. Progress Check-ins

- Create a progress check-in with:
  - Current weight.
  - Body measurements.
  - Body information.
  - Personal notes.
- View progress history.
- View weight changes.
- View body-measurement changes.
- View progress toward the active goal.

## 9. AI Coach

- Start a new conversation with the AI coach.
- Ask questions about:
  - Fitness and nutrition.
  - Today's progress.
  - Logged meals and workouts.
  - The active goal.
  - The active plan and why meals or exercises were suggested.
  - Possible changes to the plan based on preferences and progress.
  - Progress history.
- Receive answers grounded in the user's real profile, active plan, and logged fitness data.
- Request a revised plan from the conversation and review it before activation.
- Keep plan changes explicit: a conversation does not silently replace the active plan.
- Continue a previous conversation.
- View AI coach conversation history.
- Delete an AI coach conversation.
- Keep saved plans and activity logs when a conversation is deleted.

## Future Scope — Human Coaches

- Allow a human coach to create or revise a user's workout and nutrition plan.
- Let users follow and track a human-created plan through the same plan experience.
- Show who created each plan: AI or a human coach.
- Human-coach accounts, access permissions, assignment, and communication are
  outside the MVP.

## MVP Completion Journey

A user can sign up, complete their profile, set a goal, generate and activate a
weekly plan, log a planned meal and workout with actual results, record a
check-in, review their daily summary and progress, and ask the AI coach for a
revised plan. Plans, logs, and conversation history remain available after
logging out and returning.
