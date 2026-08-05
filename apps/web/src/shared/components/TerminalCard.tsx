import {
  Card,
  CardContent,
  Divider,
  Typography,
} from "@mui/material";

type Props = {
  title: string;
  children: React.ReactNode;
};

export default function TerminalCard({
  title,
  children,
}: Props) {
  return (
    <Card
      sx={{
        height: "100%",
        bgcolor: "#2f3545",
        borderRadius: 3,
      }}
    >
      <CardContent>

        <Typography
          variant="h6"
          sx={{
            fontWeight: 700,
            mb: 1,
          }}
        >
          {title}
        </Typography>

        <Divider sx={{ mb: 2 }} />

        {children}

      </CardContent>
    </Card>
  );
}