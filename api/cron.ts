export function isValidTaskGeneratorRequest(request: Request) {
  const configuredSecret = process.env.TASK_GENERATOR_SECRET;
  if (!configuredSecret) {
    return false;
  }

  const incomingSecret = request.headers.get("x-task-generator-secret");
  return incomingSecret === configuredSecret;
}
