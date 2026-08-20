import "dotenv/config";
import { app } from "./app.js";

const PORT = process.env.PORT || 5050;
const HOST = process.env.HOST || "localhost";
// here where i must start the server, and not in app.js, because app.js is just for defining the app, not starting it.
// starting the app == connecting to the database, and starting the server, and listening for requests.
const startServer = async () => {
  try {
    
   
    app.listen(PORT, () => {
      console.log(`Server running on http://${HOST}:${PORT}`);
    });
  } catch (error) {
    console.error("Could not start the server:", error.message);
    process.exit(1);
  }
};

startServer();