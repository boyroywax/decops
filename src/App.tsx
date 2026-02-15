import { AuthProvider } from "./context/AuthContext";
import { Main } from "./components/Main";

export default function App() {
  return (
    <AuthProvider>
      <Main />
    </AuthProvider>
  );
}
