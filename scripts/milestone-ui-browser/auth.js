export const useAuth = () => ({
  user: { id: "fixture-owner", email: "owner@example.invalid" },
  isOwner: true,
  loading: false,
  session: { user: { id: "fixture-owner" } },
});
