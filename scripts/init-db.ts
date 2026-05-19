import { getTrafficRepository } from "../src/lib/repository";

getTrafficRepository().migrate();
console.log("Traffic database initialized.");
