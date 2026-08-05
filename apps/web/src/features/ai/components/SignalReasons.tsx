import {
  Chip,
  Stack,
} from "@mui/material";

type Props = {
  reasons: string[];
};

export default function SignalReasons({
  reasons,
}: Props) {
  return (
    <Stack
      direction="row"
      flexWrap="wrap"
      gap={1}
    >
      {reasons.map((reason) => (
        <Chip
          key={reason}
          label={reason}
          size="small"
        />
      ))}
    </Stack>
  );
}