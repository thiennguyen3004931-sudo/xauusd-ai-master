#property copyright "XAUUSD AI MASTER"
#property version   "1.28"
#property description "Read-only Phase 7C UI v5.1 state-based decision panel"

input string InpApiUrl = "http://127.0.0.1:3711/api/v1/phase7c/decision-monitor/mt5?symbol=XAUUSD";
input int InpRefreshSeconds = 3;
input ENUM_BASE_CORNER InpCorner = CORNER_LEFT_UPPER;
input int InpX = 12;
input int InpY = 28;
input int InpFontSize = 9;

const string PREFIX = "XAU_AI_P7C_";
const int PANEL_WIDTH = 700;
const int PANEL_WAITING_HEIGHT = 522;
const int PANEL_ACTIVE_HEIGHT = 548;
// Required installer safety marker: READ ONLY | DEMO | ORDER PERMISSION = NONE

string Field(const string payload, const string wanted)
{
   string lines[];
   ushort separator = (ushort)StringGetCharacter("\n", 0);
   int count = StringSplit(payload, separator, lines);
   for(int index = 0; index < count; index++)
   {
      int equals = StringFind(lines[index], "=");
      if(equals <= 0)
         continue;
      string key = StringSubstr(lines[index], 0, equals);
      if(key == wanted)
         return StringSubstr(lines[index], equals + 1);
   }
   return "n/a";
}

bool IsEmptyValue(const string value)
{
   return value == "" || value == "n/a" || value == "N/A" || value == "null" || value == "undefined";
}

string CleanValue(const string value)
{
   if(IsEmptyValue(value))
      return "Chua co";
   if(value == "true")
      return "Co";
   if(value == "false")
      return "Chua";
   return value;
}

string Clip(const string value, const int maximum)
{
   if(maximum <= 3)
      return value;
   if(StringLen(value) <= maximum)
      return value;
   return StringSubstr(value, 0, maximum - 3) + "...";
}

string CompactText(const string value)
{
   string text = value;
   StringReplace(text, "PAUSE chặn mọi lệnh mới; không thay đổi vị thế đang được quản lý.", "PAUSE chan lenh moi; khong doi vi the dang quan ly.");
   StringReplace(text, "A confirmed CHOCH indicates a possible structural reversal.", "CHOCH xac nhan kha nang dao chieu.");
   StringReplace(text, "Bollinger bandwidth is", "Bollinger bandwidth:");
   StringReplace(text, "No valid setup", "Chua co setup hop le");
   StringReplace(text, "panel does not have order permission", "panel chi doc, khong gui lenh");
   StringReplace(text, "panel khong co quyen gui lenh", "panel chi doc, khong gui lenh");
   StringReplace(text, "panel không có quyền gửi lệnh", "panel chi doc, khong gui lenh");
   StringReplace(text, "Chờ setup hợp lệ", "Cho setup hop le");
   StringReplace(text, " · ", "\n");
   StringReplace(text, " | ", "\n");
   StringReplace(text, "; ", "\n");
   StringReplace(text, " • ", "\n");
   StringReplace(text, "•", "\n");
   return text;
}

void TakeLine(const string value, const int maximum, string &line, string &remaining)
{
   if(StringLen(value) <= maximum)
   {
      line = value;
      remaining = "";
      return;
   }

   int split = maximum;
   for(int index = maximum; index >= maximum / 2; index--)
   {
      if(StringSubstr(value, index, 1) == " ")
      {
         split = index;
         break;
      }
   }
   line = StringSubstr(value, 0, split);
   remaining = StringSubstr(value, split + 1);
}

void ReasonLines(const string value, const int maximum, string &line1, string &line2, string &line3, string &line4)
{
   string compact = CompactText(value);
   string parts[];
   ushort separator = (ushort)StringGetCharacter("\n", 0);
   int count = StringSplit(compact, separator, parts);

   line1 = "";
   line2 = "";
   line3 = "";
   line4 = "";

   int written = 0;
   for(int i = 0; i < count && written < 4; i++)
   {
      string part = parts[i];
      StringTrimLeft(part);
      StringTrimRight(part);
      if(StringLen(part) == 0)
         continue;
      if(written == 0)
         line1 = Clip(part, maximum);
      else if(written == 1)
         line2 = Clip(part, maximum);
      else if(written == 2)
         line3 = Clip(part, maximum);
      else
         line4 = Clip(part, maximum);
      written++;
   }

   if(written > 0)
      return;

   string rest1, rest2, rest3;
   TakeLine(compact, maximum, line1, rest1);
   TakeLine(rest1, maximum, line2, rest2);
   TakeLine(rest2, maximum, line3, rest3);
   line4 = Clip(rest3, maximum);
}

void DeletePanel()
{
   for(int index = ObjectsTotal(0) - 1; index >= 0; index--)
   {
      string name = ObjectName(0, index);
      if(StringFind(name, PREFIX) == 0)
         ObjectDelete(0, name);
   }
}

void Rectangle(const string suffix, const int x, const int y, const int width, const int height, const color background, const color border)
{
   string name = PREFIX + suffix;
   ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, InpCorner);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, InpX + x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, InpY + y);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, width);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, height);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, background);
   ObjectSetInteger(0, name, OBJPROP_BORDER_COLOR, border);
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void Label(const string suffix, const int x, const int y, const string text, const color textColor, const int fontSize, const string font)
{
   string name = PREFIX + suffix;
   ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, InpCorner);
   ObjectSetInteger(0, name, OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, InpX + x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, InpY + y);
   ObjectSetInteger(0, name, OBJPROP_COLOR, textColor);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fontSize);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   ObjectSetString(0, name, OBJPROP_FONT, font);
   ObjectSetString(0, name, OBJPROP_TEXT, StringLen(text) > 0 ? text : " ");
}

color RegimeColor(const string regime)
{
   if(regime == "TREND")
      return clrDeepSkyBlue;
   if(regime == "SIDEWAY")
      return clrAqua;
   if(regime == "REVERSAL")
      return clrOrange;
   return clrSilver;
}

color ProfitColor(const string value)
{
   double pnl = StringToDouble(value);
   if(pnl > 0.005)
      return clrLimeGreen;
   if(pnl < -0.005)
      return clrTomato;
   return clrSilver;
}

void DrawBase(const int height)
{
   DeletePanel();
   Rectangle("BG", 0, 0, PANEL_WIDTH, height, C'13,18,26', C'77,95,120');
   Rectangle("TOP", 0, 0, PANEL_WIDTH, 4, C'36,184,224', C'36,184,224');
}

void DrawHeader(const string activeMode, const string strategy, const string regime, const string confidence)
{
   Rectangle("HEAD", 12, 10, 676, 104, C'16,22,31', C'44,58,76');
   Label("TITLE", 24, 17, "XAUUSD AI MASTER", clrDeepSkyBlue, 13, "Arial");
   Label("VERSION", 618, 19, "UI v5.1", clrGold, 9, "Arial");
   Label("SUBTITLE", 24, 42, "Phase 7C | DEMO | READ ONLY | ORDER NONE", clrSilver, 9, "Arial");
   Label("MODE", 24, 65, "Mode: " + activeMode + " -> " + strategy, activeMode == "AUTO" ? clrLimeGreen : clrGold, 9, "Arial");
   Label("REGIME", 24, 87, "Regime: " + regime + " | Confidence: " + confidence, RegimeColor(regime), 9, "Arial");
}

void DrawFooter(const int y)
{
   Rectangle("FOOT", 12, y, 676, 48, C'18,23,31', C'42,54,69');
   Label("SAFETY1", 24, y + 9, "READ ONLY | DEMO | ORDER PERMISSION = NONE", clrSilver, 8, "Arial");
   Label("SAFETY2", 24, y + 28, "BE +6 | PARTIAL +10 (1/3)", clrSilver, 8, "Arial");
}

void DrawStatus(const int y, const string title, const string line1, const string line2, const color accent)
{
   Rectangle("STATUS", 12, y, 676, 74, C'24,33,43', accent);
   Label("STATUS_TITLE", 24, y + 11, title, accent, 14, "Arial");
   Label("STATUS_L1", 24, y + 41, line1, clrWhite, 9, "Arial");
   Label("STATUS_L2", 24, y + 59, line2, clrSilver, 8, "Arial");
}

void DrawReasonBlock(const string suffix, const int y, const string title, const string sourceText, const int height, const int maxChars)
{
   string line1, line2, line3, line4;
   ReasonLines(sourceText, maxChars, line1, line2, line3, line4);
   Rectangle(suffix + "BOX", 12, y, 676, height, C'22,27,36', C'50,63,80');
   Label(suffix + "HEAD", 24, y + 10, title, clrDeepSkyBlue, 10, "Arial");
   Label(suffix + "L1", 32, y + 34, "- " + line1, clrWhite, 9, "Arial");
   Label(suffix + "L2", 32, y + 54, StringLen(line2) > 0 ? "- " + line2 : " ", clrSilver, 9, "Arial");
   Label(suffix + "L3", 32, y + 74, StringLen(line3) > 0 ? "- " + line3 : " ", clrSilver, 9, "Arial");
   if(height >= 110)
      Label(suffix + "L4", 32, y + 94, StringLen(line4) > 0 ? "- " + line4 : " ", clrSilver, 9, "Arial");
}

void DrawInfoPair(const string id, const int xLabel, const int xValue, const int y, const string label, const string value, const color valueColor)
{
   Label(id + "L", xLabel, y, label, clrSilver, 9, "Arial");
   Label(id + "V", xValue, y, value, valueColor, 9, "Arial");
}

void RenderWaiting(const string payload)
{
   string activeMode = CleanValue(Field(payload, "activeMode"));
   string strategy = CleanValue(Field(payload, "effectiveStrategy"));
   string regime = CleanValue(Field(payload, "regime"));
   string confidence = CleanValue(Field(payload, "confidence"));
   string stage = CleanValue(Field(payload, "stage"));
   string limitReason = Field(payload, "limitReason");
   string entryReason = Field(payload, "entryReason");
   string holdReason = Field(payload, "holdReason");

   DrawBase(PANEL_WAITING_HEIGHT);
   DrawHeader(activeMode, strategy, regime, confidence);
   DrawStatus(128, "BOT DANG CHO SETUP", "Stage: " + stage + " | Khong mo lenh moi", "Trang thai hien tai chi cho phep quan sat.", clrOrange);

   DrawReasonBlock("REASON", 216, "LY DO CHO", limitReason + "\n" + entryReason + "\n" + holdReason, 118, 74);

   Rectangle("RULES", 12, 350, 676, 96, C'22,27,36', C'50,63,80');
   Label("RULES_HEAD", 24, 360, "QUY TAC GIAO DICH", clrDeepSkyBlue, 10, "Arial");
   Label("RULE1", 32, 386, "- Stoploss chuan: 6-10 gia", clrWhite, 9, "Arial");
   Label("RULE2", 32, 407, "- SL > 10 gia: cho pullback sau nen M15 xac nhan", clrWhite, 9, "Arial");
   Label("RULE3", 32, 428, "- BE +6 | Partial +10: chot 1/3 vi the", clrSilver, 9, "Arial");

   DrawFooter(462);
   ChartRedraw();
}

void RenderSetup(const string payload)
{
   string activeMode = CleanValue(Field(payload, "activeMode"));
   string strategy = CleanValue(Field(payload, "effectiveStrategy"));
   string regime = CleanValue(Field(payload, "regime"));
   string confidence = CleanValue(Field(payload, "confidence"));
   string stage = CleanValue(Field(payload, "stage"));
   string entry = CleanValue(Field(payload, "entry"));
   string stopLoss = CleanValue(Field(payload, "stopLoss"));
   string distance = CleanValue(Field(payload, "stopDistance"));
   string volume = CleanValue(Field(payload, "finalLot"));
   string riskUsd = CleanValue(Field(payload, "estimatedRiskUsd"));
   string tp1 = CleanValue(Field(payload, "tp1"));
   string tp2 = CleanValue(Field(payload, "tp2"));
   string side = CleanValue(Field(payload, "side"));
   string setup = CleanValue(Field(payload, "setup"));

   DrawBase(PANEL_ACTIVE_HEIGHT);
   DrawHeader(activeMode, strategy, regime, confidence);
   DrawStatus(128, "SETUP HOP LE", "Stage: " + stage + " | Cho entry gate", "Panel chi doc, khong gui lenh.", clrLimeGreen);

   Rectangle("PLAN", 12, 216, 676, 128, C'22,27,36', C'50,63,80');
   Label("PLAN_HEAD", 24, 226, "KE HOACH LENH", clrDeepSkyBlue, 10, "Arial");
   DrawInfoPair("P1", 32, 160, 254, "Diem vao", entry, clrWhite);
   DrawInfoPair("P2", 32, 160, 276, "Stoploss", stopLoss, clrTomato);
   DrawInfoPair("P3", 32, 160, 298, "Khoang SL", distance, clrWhite);
   DrawInfoPair("P4", 32, 160, 320, "Lot", volume, clrAqua);
   DrawInfoPair("Q1", 370, 500, 254, "TP1", tp1, clrLimeGreen);
   DrawInfoPair("Q2", 370, 500, 276, "TP2", tp2, clrLimeGreen);
   DrawInfoPair("Q3", 370, 500, 298, "Huong", side, clrGold);
   DrawInfoPair("Q4", 370, 500, 320, "Risk USD", riskUsd, clrSilver);
   Label("SETUP", 32, 344, "Setup: " + Clip(setup, 56), clrSilver, 8, "Arial");

   DrawReasonBlock("REASON", 366, "LY DO VAO LENH", Field(payload, "entryReason"), 98, 74);
   DrawFooter(482);
   ChartRedraw();
}

void RenderManaging(const string payload)
{
   string activeMode = CleanValue(Field(payload, "activeMode"));
   string strategy = CleanValue(Field(payload, "positionStrategy"));
   string regime = CleanValue(Field(payload, "regime"));
   string confidence = CleanValue(Field(payload, "confidence"));
   string ticket = CleanValue(Field(payload, "ticket"));
   string side = CleanValue(Field(payload, "positionSide"));
   string volume = CleanValue(Field(payload, "positionVolume"));
   string entry = CleanValue(Field(payload, "positionEntry"));
   string current = CleanValue(Field(payload, "currentPrice"));
   string stopLoss = CleanValue(Field(payload, "positionStopLoss"));
   string tp1 = CleanValue(Field(payload, "positionTp1"));
   string tp2 = CleanValue(Field(payload, "positionTp2"));
   string pnl = CleanValue(Field(payload, "floatingPnlUsd"));
   string be = CleanValue(Field(payload, "breakEvenApplied"));
   string partial = CleanValue(Field(payload, "partialApplied"));

   DrawBase(PANEL_ACTIVE_HEIGHT);
   DrawHeader(activeMode, strategy, regime, confidence);
   DrawStatus(128, "DANG GIU LENH " + side, "Ticket: " + ticket + " | Lot: " + volume, "P/L USD: " + pnl, ProfitColor(pnl));

   Rectangle("POS", 12, 216, 676, 142, C'22,27,36', C'50,63,80');
   Label("POS_HEAD", 24, 226, "VI THE DANG MO", clrDeepSkyBlue, 10, "Arial");
   DrawInfoPair("M1", 32, 160, 254, "Entry", entry, clrWhite);
   DrawInfoPair("M2", 32, 160, 276, "Gia hien tai", current, clrWhite);
   DrawInfoPair("M3", 32, 160, 298, "Stoploss", stopLoss, clrTomato);
   DrawInfoPair("M4", 32, 160, 320, "P/L USD", pnl, ProfitColor(pnl));
   DrawInfoPair("N1", 370, 500, 254, "TP1", tp1, clrLimeGreen);
   DrawInfoPair("N2", 370, 500, 276, "TP2", tp2, clrLimeGreen);
   DrawInfoPair("N3", 370, 500, 298, "BE", be, clrAqua);
   DrawInfoPair("N4", 370, 500, 320, "Partial", partial, clrAqua);

   DrawReasonBlock("HOLD", 374, "LY DO GIU / QUAN LY", Field(payload, "holdReason"), 90, 74);
   DrawFooter(482);
   ChartRedraw();
}

void RenderError(const string title, const string message, const bool showWebRequestHelp)
{
   DrawBase(360);
   Rectangle("STATUS", 12, 60, 676, 72, C'55,30,30', C'210,70,70');
   Rectangle("RECOVERY", 12, 150, 676, 128, C'22,27,36', C'50,63,80');
   Rectangle("FOOT", 12, 296, 676, 46, C'18,23,31', C'42,54,69');

   Label("TITLE", 24, 18, "XAUUSD AI MASTER", clrDeepSkyBlue, 13, "Arial");
   Label("VERSION", 618, 20, "UI v5.1", clrGold, 9, "Arial");
   Label("SUBTITLE", 24, 42, "Phase 7C | DEMO | READ ONLY", clrSilver, 9, "Arial");
   Label("ERR_TITLE", 24, 76, title, clrTomato, 12, "Arial");
   Label("ERR_NOTE", 24, 105, message, clrWhite, 9, "Arial");

   Label("RECOVERY_HEAD", 24, 162, "HUONG DAN", clrDeepSkyBlue, 10, "Arial");
   if(showWebRequestHelp)
   {
      Label("HELP1", 32, 190, "1. Tools > Options > Expert Advisors", clrWhite, 9, "Arial");
      Label("HELP2", 32, 212, "2. Allow WebRequest: http://127.0.0.1:3711", clrGold, 9, "Arial");
      Label("HELP3", 32, 234, "3. Attach lai EA panel tren chart XAUUSD", clrSilver, 9, "Arial");
   }
   else
   {
      Label("HELP1", 32, 190, "API/Bridge dang khoi tao hoac du lieu loi tam thoi.", clrWhite, 9, "Arial");
      Label("HELP2", 32, 212, "Panel tu dong tai lai moi " + IntegerToString(InpRefreshSeconds) + " giay.", clrGold, 9, "Arial");
      Label("HELP3", 32, 234, "Giu MT5 va Control API dang chay.", clrSilver, 9, "Arial");
   }
   Label("SAFETY1", 24, 306, "READ ONLY | DEMO | ORDER PERMISSION = NONE", clrSilver, 8, "Arial");
   Label("SAFETY2", 24, 324, "Panel khong co quyen gui lenh.", clrSilver, 8, "Arial");
   ChartRedraw();
}

void Render(const string payload)
{
   string positionState = Field(payload, "positionState");
   string approved = Field(payload, "approved");
   if(positionState == "MANAGING")
      RenderManaging(payload);
   else if(approved == "true")
      RenderSetup(payload);
   else
      RenderWaiting(payload);
}

void RefreshPanel()
{
   char request[];
   char response[];
   string responseHeaders;
   string headers = "Accept: text/plain\r\nCache-Control: no-store\r\n";
   ResetLastError();
   int status = WebRequest("GET", InpApiUrl, headers, 5000, request, response, responseHeaders);
   if(status == -1)
   {
      RenderError("KHONG GOI DUOC CONTROL API", "WebRequest error " + IntegerToString(GetLastError()), true);
      return;
   }
   if(status != 200)
   {
      RenderError("CONTROL API CHUA SAN SANG", "Decision API returned HTTP " + IntegerToString(status), false);
      return;
   }
   string payload = CharArrayToString(response, 0, -1, CP_UTF8);
   if(Field(payload, "version") != "1")
   {
      RenderError("DU LIEU PANEL KHONG HOP LE", "Decision API payload version is invalid", false);
      return;
   }
   Render(payload);
}

int OnInit()
{
   DeletePanel();
   EventSetTimer((int)MathMax(1, InpRefreshSeconds));
   RefreshPanel();
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
   DeletePanel();
   ChartRedraw();
}

void OnTimer()
{
   RefreshPanel();
}
