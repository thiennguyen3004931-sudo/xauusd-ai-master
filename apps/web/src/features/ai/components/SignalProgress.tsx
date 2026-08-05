import {
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";

type Props = {
  confidence: number;
};

export default function SignalProgress({
  confidence,
}: Props) {
  return (
    <Stack spacing={1}>
      <Typography variant="body2">
        Confidence {confidence}%
      </Typography>

      <LinearProgress
        variant="determinate"
        value={confidence}
      />
    </Stack>
  );
}