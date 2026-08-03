export default function Sidebar() {
  return (
    <aside
      style={{
        width: 240,
        background: "#111827",
        color: "white",
        padding: 20,
      }}
    >
      <h3>MENU</h3>

      <ul style={{ listStyle: "none", padding: 0 }}>
        <li>Dashboard</li>
        <li>Trading</li>
        <li>Market</li>
        <li>Signals</li>
        <li>Journal</li>
        <li>Settings</li>
      </ul>
    </aside>
  );
}