import { Card } from "@/components/ui/card";

type StatCardProps = {
  title: string;
  value: string;
};

export default function StatCard({
  title,
  value,
}: StatCardProps) {
  return (
    <Card className="p-5">
      <p className="text-sm text-gray-500">{title}</p>

      <h2 className="mt-2 text-2xl font-bold">
        {value}
      </h2>
    </Card>
  );
}