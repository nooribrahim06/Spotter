import {
    InvalidAccessTokenError,
    InvalidActionConfirmationError,
} from "./errorHandling.js";
import { findUserPasswordHashById } from "../modules/users/user.repository.js";
import bcrypt from "bcryptjs";

// i will use it to make the user type her password before any sensitive action, like changing email or password, or deleting account.

export async function confirmActionController(req, res, next) {
    const { password } = req.validatedBody;
    const user = await findUserPasswordHashById(req.auth.userId);
    if (!user) {
        throw new InvalidAccessTokenError();
    }
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
        throw new InvalidActionConfirmationError();
    }
    return next();
}
