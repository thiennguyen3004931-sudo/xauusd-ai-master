import { createTheme } from "@mui/material/styles";
import { palette } from "./palette";

export const theme = createTheme({
  palette,

  shape: {
    borderRadius: 12,
  },

  typography: {
    fontFamily: [
      "Inter",
      "Roboto",
      "Segoe UI",
      "Arial",
      "sans-serif",
    ].join(","),
  },

  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: "none",
          border: "1px solid rgba(255,255,255,0.06)",
          backgroundImage: "none",
        },
      },
    },

    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },

    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          borderRadius: 10,
          fontWeight: 600,
        },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
        },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: "1px solid rgba(255,255,255,.08)",
        },
      },
    },
  },
});