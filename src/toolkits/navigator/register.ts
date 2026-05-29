/**
 * Navigator Toolkit — UI registration (side-effect module).
 */
import { registerToolkitView } from "@/services/toolkits/uiRegistry";
import { NavigatorView } from "./views/NavigatorView";
import "./styles/navigator.css";

registerToolkitView({
  toolkitId: "navigator",
  viewIds: ["navigator"],
  Component: NavigatorView,
});
