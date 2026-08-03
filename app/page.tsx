import MainLayout from "@/components/layout/MainLayout";
import StatCard from "@/components/dashboard/StatCard";

export default function Home() {
  return (
    <MainLayout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">
          Dashboard
        </h1>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Balance" value="$100,000" />
          <StatCard title="Win Rate" value="82%" />
          <StatCard title="Signals" value="0" />
          <StatCard title="Market" value="Waiting..." />
        </div>
      </div>
    </MainLayout>
  );
}