import * as goalService from "./goal.service.js";
import { InvalidAccessTokenError } from "../../middlewares/errorHandling.js";


export async function createGoalController(req, res){
    const user = req.user; // Assuming the user is authenticated and available in req.user
    if(!user) 
        throw new InvalidAccessTokenError("User not authenticated.");
    const result = await goalService.createGoal(user.id, req.body);
    res.status(201).json(result);
}