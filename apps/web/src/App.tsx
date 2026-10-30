import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import { SignInScreen } from "./features/auth/SignInScreen";

function AuthenticatedPlaceholder() {
  const { session } = useAuth();
  return (
    <main>
      <h1>Apptomate Leave Management</h1>
      <p>Signed in as {session?.email}</p>
    </main>
  );
}

function AppContent() {
  const { session } = useAuth();
  return session ? <AuthenticatedPlaceholder /> : <SignInScreen />;
}

function App() {
  return (
    <AuthProvider>
      <Toaster />
      <AppContent />
    </AuthProvider>
  );
}

export default App;
