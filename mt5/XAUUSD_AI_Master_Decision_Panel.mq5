#property copyright "XAUUSD AI MASTER"
#property version   "1.26"
#property description "Read-only Phase 7C UI v5 state-based decision panel"

input string InpApiUrl = "http://127.0.0.1:3711/api/v1/phase7c/decision-monitor/mt5?symbol=XAUUSD";
input int InpRefreshSeconds = 3;
input ENUM_BASE_CORNER InpCorner = CORNER_LEFT_UPPER;
input int InpX = 12;
input int InpY = 28;
input int InpFontSize = 10;

const string PREFIX = "XAU_AI_P7C_";
const int PANEL_WIDTH = 620;
const int PANEL_HEIGHT = 470;
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

void ReasonLines(const string value, const int maximum, string &line1, string &line2, string &line3)
{
   string compact = CompactText(value);
   string parts[];
   ushort separator = (ushort)StringGetCharacter("\n", 0);
   int count = StringSplit(compact, separator, parts);

   line1 = "";
   line2 = "";
   line3 = "";

   int written = 0;
   for(int i = 0; i < count && written < 3; i++)
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
      else
         line3 = Clip(part, maximum);
      written++;
   }

   if(written > 0)
      return;

   string rest;
   TakeLine(compact, maximum, line1, rest);
   TakeLine(rest, maximum, line2, line3);
   line3 = Clip(line3, maximum);
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

void Label(const string suffix, const int x, const int y, const string text, const color textColor = clrWhite, const int fontSize = 0, const string font = "Arial")
{
   string name = PREFIX + suffix;
   ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, InpCorner);
   ObjectSetInteger(0, name, OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, InpX + x);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, InpY + y);
   ObjectSetInteger(0, name, OBJPROP_COLOR, textColor);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fontSize > 0 ? fontSize : InpFontSize);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
   ObjectSetString(0, name, OBJPROP_FONT, font);
   ObjectSetString(0, name, OBJPROP_TEXT, StringLen(text) > 0 ? text : " ");
}

color StateColor(const string positionState, const string stage, const string approved)
{
   if(positionState == "MANAGING")
      return clrLimeGreen;
   if(positionState == "UNMANAGED" || stage == "ERROR")
      return clrOrangeRed;
   if(stage == "BLOCKED" || stage == "PAUSE")
      return clrOrange;
   if(approved == "true")
      return clrLimeGreen;
   return clrGold;
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

void DrawBase(const int height = PANEL_HEIGHT)
{
   DeletePanel();
   Rectangle("BG", 0, 0, PANEL_WIDTH, height, C'13,18,26', C'77,95,120');
   Rectangle("TOP", 0, 0, PANEL_WIDTH, 4, C'36,184,224', C'36,184,224');
}

void DrawHeader(const string activeMode, const string strategy, const string regime, const string confidence)
{
   Rectangle("HEAD", 12, 12, 596, 96, C'16,23,34', C'48,64,84');
   Label("TITLE", 24, 20, "XAUUSD AI MASTER", clrDeepSkyBlue, 15, "Arial");
   Label("UIV5", 528, 22, "UI v5", clrGold, 10, "Arial");
   Label("SUBTITLE", 24, 47, "DEMO | READ ONLY | ORDER NONE", clrSilver, 10, "Arial");
   Label("MODE", 24, 75, "Mode: " + activeMode + " -> " + strategy, activeMode == "AUTO" ? clrLimeGreen : clrGold, 11, "Arial");
   Label("REGIME", 335, 75, "Regime: " + regime + " | Conf: " + confidence, RegimeColor(regime), 11, "Arial");
}

void DrawFooter(const int y)
{
   Rectangle("FOOT", 12, y, 596, 44, C'18,24,33', C'44,58,76');
   Label("SAFETY1", 24, y + 8, "READ ONLY | DEMO | ORDER PERMISSION = NONE", clrSilver, 9, "Arial");
   Label("SAFETY2", 24, y + 25, "BE +6 | PARTIAL +10 (1/3)", clrSilver, 9, "Arial");
}

void DrawInfoPair(const string id, const int xLabel, const int xValue, const int y, const string label, const string value, const color valueColor)
{
   Label(id + "L", xLabel, y, label, clrSilver, 10, "Arial");
   Label(id + "V", xValue, y, value, valueColor, 10, "Arial");
}

void DrawReasonBlock(const string suffix, const int y, const int height, const string title, const string sourceText, const int maxChars)
{
   string line1, line2, line3;
   ReasonLines(sourceText, maxChars, line1, line2, line3);
   Rectangle(suffix + "BOX", 12, y, 596, height, C'22,29,39', C'54,70,90');
   Label(suffix + "HEAD", 24, y + 11, title, clrDeepSkyBlue, 11, "Arial");
   Label(suffix + "L1", 32, y + 39, "- " + line1, clrWhite, 10, "Arial");
   Label(suffix + "L2", 32, y + 63, StringLen(line2) > 0 ? "- " + line2 : " ", clrSilver, 10, "Arial");
   if(height >= 104)
      Label(suffix + "L3", 32, y + 87, StringLen(line3) > 0 ? "- " + line3 : " ", clrSilver, 10, "Arial");
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
   string reasonSource = limitReason + "\n" + entryReason + "\n" + holdReason;
   color stateColor = StateColor("FLAT", stage, "false");

   DrawBase(470);
   DrawHeader(activeMode, strategy, regime, confidence);

   Rectangle("STATUS", 12, 122, 596, 74, C'25,34,45', stateColor);
   Label("STATUS_TITLE", 24, 135, "BOT DANG CHO SETUP", stateColor, 15, "Arial");
   Label("STATUS_NOTE1", 24, 162, "Stage: " + stage + " | Khong mo lenh moi", clrWhite, 10, "Arial");
   Label("STATUS_NOTE2", 24, 181, "Chi quan sat cho setup hop le", clrSilver, 9, "Arial");

   DrawReasonBlock("WAIT", 210, 108, "LY DO CHO", reasonSource, 66);

   Rectangle("RULES", 12, 332, 596, 82, C'22,29,39', C'54,70,90');
   Label("RULES_HEAD", 24, 343, "QUY TAC GIAO DICH", clrDeepSkyBlue, 11, "Arial");
   Label("RULE1", 32, 371, "- SL chuan: 6-10 gia", clrWhite, 10, "Arial");
   Label("RULE2", 252, 371, "- SL > 10: cho pullback sau M15", clrWhite, 10, "Arial");
   Label("RULE3", 32, 394, "- BE +6 | Partial +10: chot 1/3", clrSilver, 10, "Arial");

   DrawFooter(424);
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
   string setup = Clip(CleanValue(Field(payload, "setup")), 22);

   DrawBase(498);
   DrawHeader(activeMode, strategy, regime, confidence);

   Rectangle("STATUS", 12, 122, 596, 64, C'25,34,45', clrLimeGreen);
   Label("STATUS_TITLE", 24, 134, "SETUP HOP LE - CHO VAO LENH", clrLimeGreen, 14, "Arial");
   Label("STATUS_NOTE", 24, 162, "Stage: " + stage + " | Setup: " + setup, clrWhite, 10, "Arial");

   Rectangle("PLAN", 12, 202, 596, 130, C'22,29,39', C'54,70,90');
   Label("PLAN_HEAD", 24, 214, "KE HOACH LENH", clrDeepSkyBlue, 11, "Arial");
   DrawInfoPair("P1", 34, 150, 244, "Entry", entry, clrWhite);
   DrawInfoPair("P2", 34, 150, 268, "Stoploss", stopLoss, clrTomato);
   DrawInfoPair("P3", 34, 150, 292, "Khoang SL", distance, clrWhite);
   DrawInfoPair("P4", 34, 150, 316, "Lot", volume, clrAqua);
   DrawInfoPair("Q1", 340, 448, 244, "TP1", tp1, clrLimeGreen);
   DrawInfoPair("Q2", 340, 448, 268, "TP2", tp2, clrLimeGreen);
   DrawInfoPair("Q3", 340, 448, 292, "Huong", side, clrGold);
   DrawInfoPair("Q4", 340, 448, 316, "Risk USD", riskUsd, clrSilver);

   DrawReasonBlock("ENTRY", 346, 82, "LY DO VAO LENH", Field(payload, "entryReason"), 66);
   DrawFooter(440);
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
   string entry = CleanValue(Field(payload, "positionEntry"));
   string current = CleanValue(Field(payload, "currentPrice"));
   string stopLoss = CleanValue(Field(payload, "positionStopLoss"));
   string tp1 = CleanValue(Field(payload, "positionTp1"));
   string tp2 = CleanValue(Field(payload, "positionTp2"));
   string volume = CleanValue(Field(payload, "positionVolume"));
   string pnl = CleanValue(Field(payload, "floatingPnlUsd"));
   string favorable = CleanValue(Field(payload, "favorableDistance"));
   string be = CleanValue(Field(payload, "breakEvenApplied"));
   string partial = CleanValue(Field(payload, "partialApplied"));

   DrawBase(498);
   DrawHeader(activeMode, strategy, regime, confidence);

   Rectangle("STATUS", 12, 122, 596, 64, C'25,34,45', clrLimeGreen);
   Label("STATUS_TITLE", 24, 134, "DANG GIU LENH " + side, clrLimeGreen, 14, "Arial");
   Label("STATUS_NOTE", 24, 162, "Ticket: " + ticket + " | Lot: " + volume + " | P/L: " + pnl + " USD", ProfitColor(pnl), 10, "Arial");

   Rectangle("POSITION", 12, 202, 596, 130, C'22,29,39', C'54,70,90');
   Label("POS_HEAD", 24, 214, "QUAN LY VI THE", clrDeepSkyBlue, 11, "Arial");
   DrawInfoPair("P1", 34, 150, 244, "Entry", entry, clrWhite);
   DrawInfoPair("P2", 34, 150, 268, "Gia hien tai", current, clrWhite);
   DrawInfoPair("P3", 34, 150, 292, "Stoploss", stopLoss, clrTomato);
   DrawInfoPair("P4", 34, 150, 316, "Loi gia", favorable, clrAqua);
   DrawInfoPair("Q1", 340, 448, 244, "TP1", tp1, clrLimeGreen);
   DrawInfoPair("Q2", 340, 448, 268, "TP2", tp2, clrLimeGreen);
   DrawInfoPair("Q3", 340, 448, 292, "BE", be, clrGold);
   DrawInfoPair("Q4", 340, 448, 316, "Partial", partial, clrGold);

   DrawReasonBlock("HOLD", 346, 82, "LY DO GIU LENH", Field(payload, "holdReason"), 66);
   DrawFooter(440);
   ChartRedraw();
}

void RenderError(const string title, const string message, const bool showWebRequestHelp)
{
   DrawBase(360);
   Rectangle("STATUS", 12, 58, 596, 70, C'55,30,30', C'210,70,70');
   Rectangle("RECOVERY", 12, 146, 596, 128, C'22,29,39', C'54,70,90');
   Rectangle("FOOT", 12, 292, 596, 44, C'18,24,33', C'44,58,76');

   Label("TITLE", 24, 18, "XAUUSD AI MASTER", clrDeepSkyBlue, 15, "Arial");
   Label("UIV5", 528, 20, "UI v5", clrGold, 10, "Arial");
   Label("SUBTITLE", 24, 42, "DEMO | READ ONLY | ORDER NONE", clrSilver, 10, "Arial");
   Label("STATUS_TITLE", 24, 72, title, clrTomato, 13, "Arial");
   Label("STATUS_NOTE", 24, 100, message, clrWhite, 10, "Arial");

   Label("RECOVERY_HEAD", 24, 160, "HUONG DAN", clrDeepSkyBlue, 11, "Arial");
   if(showWebRequestHelp)
   {
      Label("HELP1", 32, 190, "1. Tools > Options > Expert Advisors", clrWhite, 10, "Arial");
      Label("HELP2", 32, 214, "2. Allow WebRequest: http://127.0.0.1:3711", clrGold, 10, "Arial");
      Label("HELP3", 32, 238, "3. Attach lai EA panel neu chart chua cap nhat", clrSilver, 10, "Arial");
   }
   else
   {
      Label("HELP1", 32, 190, "API/Bridge dang khoi tao hoac tra du lieu tam thoi loi.", clrWhite, 10, "Arial");
      Label("HELP2", 32, 214, "Panel tu dong tai lai moi " + IntegerToString(InpRefreshSeconds) + " giay.", clrGold, 10, "Arial");
      Label("HELP3", 32, 238, "Giu MT5 va Control API dang chay.", clrSilver, 10, "Arial");
   }
   Label("SAFETY1", 24, 301, "READ ONLY | DEMO | ORDER PERMISSION = NONE", clrSilver, 9, "Arial");
   Label("SAFETY2", 24, 318, "Khong co quyen gui lenh tu panel.", clrSilver, 9, "Arial");
   ChartRedraw();
}

void Render(const string payload)
{
   string positionState = Field(payload, "positionState");
   string approved = Field(payload, "approved");

   if(positionState == "MANAGING" || positionState == "UNMANAGED")
   {
      RenderManaging(payload);
      return;
   }

   if(approved == "true")
   {
      RenderSetup(payload);
      return;
   }

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
      if(status == 503)
         RenderError("DANG KET NOI LAI MT5", "Decision API returned HTTP 503", false);
      else
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
