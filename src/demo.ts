process.env.SLOTH_DEMO_MODE = "true";

const { startServer } = await import("./server.js");

startServer();
