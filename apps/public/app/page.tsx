import { getPublicChatBranding } from "../lib/resolve-public-company-name";
import { ChatPageClient } from "./chat-page-client";

export default async function PublicChatPage() {
  const {
    companyName,
    website,
    supportLink,
    colorPalette,
    accentColor,
    defaultMessage,
  } = await getPublicChatBranding();
  return (
    <ChatPageClient
      companyName={companyName}
      initialColorPalette={colorPalette}
      initialAccentColor={accentColor}
      initialSupportLink={supportLink}
      initialWebsiteLink={website}
      initialDefaultMessageFromEdge={defaultMessage}
    />
  );
}
