
import * as goalsRepo from './goal.repository.js';

export async function createGoal(userId, data) {
    // the user must have not an active goal , the previous goals must be explicitly completed or cancelled 
    // if the user has an active goal , he cannot create a new goal
    const activeGoals = goalsRepo.findActiveGoalByUserId(userId);
    if (activeGoals) {
        throw new Error("User already has an active goal. Complete or cancel the existing goal before creating a new one.");
    }   

   // create the goal in the database
   // it will be created with status DRAFT , the user must click activate to make it active , and the user can only have one active goal at a time
   const newGoal = await goalsRepo.createGoal(userId, data);
   return newGoal;
}
