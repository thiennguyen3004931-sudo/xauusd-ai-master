import { SnackbarProvider } from "notistack";

export default function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SnackbarProvider
      maxSnack={3}
      autoHideDuration={3000}
    >
      {children}
    </SnackbarProvider>
  );
}