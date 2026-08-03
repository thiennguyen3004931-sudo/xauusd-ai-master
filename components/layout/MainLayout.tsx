import Header from "./Header";
import Sidebar from "./Sidebar";
import Footer from "./Footer";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />

      <div
        style={{
          display: "flex",
          minHeight: "calc(100vh - 114px)",
        }}
      >
        <Sidebar />

        <main
          style={{
            flex: 1,
            padding: 24,
            background: "#1e293b",
            color: "white",
          }}
        >
          {children}
        </main>
      </div>

      <Footer />
    </>
  );
}