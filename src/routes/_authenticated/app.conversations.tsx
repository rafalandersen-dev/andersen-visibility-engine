import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { MiloAccountConversations } from "@/components/MiloAccountConversations";
import { useAuth } from "@/lib/auth";
import { useT } from "@/i18n";
import { miloConversationHref } from "@/lib/milo-conversation-location";

export const Route = createFileRoute("/_authenticated/app/conversations")({
  head: () => ({
    meta: [
      { title: "Your conversations — Milo Growth" },
      { name: "description", content: "Manage your private Milo conversations across projects." },
    ],
  }),
  component: AccountConversationsPage,
});
function AccountConversationsPage() {
  const { user } = useAuth(),
    t = useT(),
    navigate = useNavigate();
  return (
    <AppShell title={t("chat.account.title")} description={t("chat.account.description")}>
      {user && (
        <MiloAccountConversations
          key={user.id}
          actorId={user.id}
          conversationHref={(target) => miloConversationHref(target, target.conversationId)}
          onOpen={(target) =>
            void navigate({
              to: "/app",
              search: {
                owner: target.ownerId,
                project: target.projectId,
                conversation: target.conversationId,
              },
            })
          }
        />
      )}
    </AppShell>
  );
}
