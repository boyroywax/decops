/**
 * Navigator Toolkit — barrel export.
 *
 * Public API for the goal/huddle navigator. Includes the toolkit
 * module, the service singleton, and the chat-banner component.
 */
export { navigatorModule } from "./module";
export { navigatorService } from "./service";
export { NavigatorChatBanner } from "./components/NavigatorChatBanner";
export { NavigatorView } from "./views/NavigatorView";
export type {
  NavigatorGoal,
  NavigatorSubgoal,
  NavigatorHuddle,
  NavigatorSnapshot,
  NavigatorBotConfig,
  NavigatorBotStatus,
} from "./types";
