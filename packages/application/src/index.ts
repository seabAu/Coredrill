/** Use-case orchestration and query DTOs over domain ports. */
export {
  defineCommand,
  defineQuery,
  type ApplicationCommand,
  type ApplicationCommandName,
  type ApplicationOperationContext,
  type ApplicationQuery,
  type ApplicationQueryName,
} from "./operation.js";
export {
  APPLICATION_ERROR_CODES,
  applicationError,
  applicationFailure,
  applicationSuccess,
  type ApplicationError,
  type ApplicationErrorCode,
  type ApplicationResult,
} from "./result.js";
