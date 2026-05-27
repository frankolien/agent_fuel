import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "./auth";
import { ErrorBoundary } from "./ErrorBoundary";
import { queryClient } from "./queryClient";
import { router } from "./router";
import { WalletProviders } from "./WalletProviders";

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <WalletProviders>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </WalletProviders>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
