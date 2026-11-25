import type { PluginClientContext } from "@getpaseo/plugin/client";
import { messages } from "./client/messages";
import { OutlinePanel } from "./client/outline-panel";
import { OutlineSettings } from "./client/settings-screen";

export default function contribute(client: PluginClientContext) {
  const removePanel = client.addFilePanel({
    id: "outline",
    title: messages.message("panelTitle"),
    icon: "ListTree",
    files: { extensions: ["md", "markdown"] },
    Component: OutlinePanel,
  });
  const removeSettings = client.addSettingsScreen({
    id: "layout",
    title: messages.message("settingsTitle"),
    icon: "PanelLeft",
    Component: OutlineSettings,
  });
  return () => {
    removePanel();
    removeSettings();
  };
}
