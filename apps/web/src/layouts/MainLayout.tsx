import { Outlet } from "react-router-dom";
import Header from "../components/Header/Header";
import Sidebar from "../components/Sidebar/Sidebar";

export default function MainLayout() {
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#111827",
        color: "white"
      }}
    >
      <Sidebar />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column"
        }}
      >
        <Header />

        <main
          style={{
            flex: 1,
            padding: 20
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}