import {
  Stack,
  Typography,
} from "@mui/material";

type Props = {
  signal: any;
};

export default function TradePlanTable({
  signal,
}: Props) {
  return (
    <Stack spacing={1}>
      <Typography>
        Entry : {signal.entry}
      </Typography>

      <Typography>
        Stop Loss : {signal.sl}
      </Typography>

      <Typography>
        TP1 : {signal.tp1}
      </Typography>

      <Typography>
        TP2 : {signal.tp2}
      </Typography>

      <Typography>
        TP3 : {signal.tp3}
      </Typography>

      <Typography>
        RR : {signal.rr}
      </Typography>
    </Stack>
  );
}