# Nodemon

## What it is

Nodemon is a development utility that watches files and restarts a Node.js process when relevant files change. It shortens the edit-run-check loop; it is not part of request handling and should not be treated as a production process manager.

## How Spotter uses it

[`backend/package.json`](../../../backend/package.json) defines:

```json
{
  "scripts": {
    "dev": "nodemon src/index.js"
  }
}
```

Running the development script starts `src/index.js` through Nodemon. When watched JavaScript or JSON files change, Nodemon stops and restarts the child Node.js process so the updated backend loads.

```text
npm run dev
```

Nodemon is correctly classified as a development dependency because deployed requests do not require it.

## What it can do next

- Use a project `nodemon.json` for consistent watch, ignore, extension, delay, and environment settings.
- Watch `.env` explicitly when local configuration changes should restart the server.
- Ignore generated files, logs, uploads, and other write-heavy directories that would cause restart loops.
- Run Node.js with debugging flags through `exec` configuration.
- Trigger checks or notifications on lifecycle events.
- Manually restart the child process by typing `rs` in the active Nodemon terminal.

## Operational notes

- Do not use Nodemon as the production availability strategy. Use the hosting platform, container orchestrator, or a production process supervisor.
- Restarting discards in-memory state, including the current express-rate-limit `MemoryStore` counts.
- A restart should eventually close database resources gracefully rather than depending only on process termination.
- Hidden files such as `.env` are not always watched by default; configure them explicitly if needed.
- Broad watch patterns can cause repeated restarts when the application writes files inside the watched tree.

## Official references

- [Nodemon repository and usage](https://github.com/remy/nodemon)
- [Nodemon FAQ](https://github.com/remy/nodemon/blob/main/faq.md)

