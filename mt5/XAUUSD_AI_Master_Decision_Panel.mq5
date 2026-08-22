#property copyright "XAUUSD AI MASTER"
#property version   "1.25"
#property description "Read-only Phase 7C state-based decision panel"

input string InpApiUrl = "http://127.0.0.1:3711/api/v1/phase7c/decision-monitor/mt5?symbol=XAUUSD";
input int InpRefreshSeconds = 3;
input ENUM_BASE_CORNER InpCorner = CORNER_LEFT_UPPER;
input int InpX = 12;
input int InpY = 28;
input int InpFontSize = 10;

const string PREFIX = "XAU_AI_P7C_";
const int PANEL_WIDTH = 560;
const int PANEL_HEIGHT = 448;
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

string CleanValue(const string value)
{
   if(value == "" || value == "n/a" || value == "N/A" || value == "null" || value == "undefined")
      return "Chua co";
   if(value == "true")
      return "Co";
   if(value == "false")
      return "Chua";
   return value;
}

string Clip(const string value, const int maximum)
{
   if(StringLen(value) <= maximum)
      return value;
   return StringSubstr(value, 0, maximum - 3) + "...";
}

string CompactText(const string value)
{
   string text = value;
   StringReplace(text, "A confirmed CHOCH indicates a possible structural reversal.", "CHOCH xac nhan kha nang dao chieu.");
   StringReplace(text, "Bollinger bandwidth is", "Bollinger bandwidth:");
   StringReplace(text, "No valid setup", "Chua co setup hop le");
   StringReplace(text, "panel does not have order permission", "panel chi doc, khong gui lenh");
   StringReplace(text, "panel khong co quyen gui lenh", "panel chi doc, khong gui lenh");
   StringReplace(text, "panel không có quyền gửi lệnh", "panel chi doc, khong gui lenh");
   StringReplace(text, " · ", "\n");
   StringReplace(text, " | ", "\n");
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

   if(count >= 2)
   {
      line1 = Clip(parts[0], maximum);
      line2 = Clip(parts[1], maximum);
      line3 = count >= 3 ? Clip(parts[2], maximum) : "";
      return;
   }

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

color StatusColor(const string positionState, const string stage, const string approved)
{
   if(positionState == "MANAGING")
      return clrLimeGreen;
   if(positionState == "UNMANAGED" || stage == "ERROR")
      return clrOrangeRed;
   if(stage == "BLOCKED")
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

void DrawBase()
{
   DeletePanel();
   Rectangle("BG", 0, 0, PANEL_WIDTH, PANEL_HEIGHT, C'14,18,25', C'72,88,110');
   Rectangle("TOP", 0, 0, PANEL_WIDTH, 4, C'36,184,224', C'36,184,224');
}

void DrawHeader(const string activeMode, const string strategy, const string regime, const string confidence)
{
   Rectangle("HEAD", 12, 10, 536, 90, C'16,22,31', C'44,58,76');
   Label("TITLE", 22, 17, "XAUUSD AI MASTER", clrDeepSkyBlue, 14, "Arial");
   Label("SUBTITLE", 22, 42, "Phase 7C | DEMO | READ ONLY", clrSilver, 10, "Arial");
   Label("MODE", 22, 65, "Mode: " + activeMode + " -> " + strategy, activeMode == "AUTO" ? clrLimeGreen : clrGold, 10, "Arial");
   Label("REGIME", 295, 65, "Regime: " + regime + " | Conf: " + confidence, RegimeColor(regime), 10, "Arial");
}

void DrawFooter()
{
   Rectangle("FOOT", 12, 400, 536, 38, C'18,23,31', C'42,54,69');
   Label("SAFETY1", 24, 407, "READ ONLY | DEMO | ORDER PERMISSION = NONE", clrSilver, 9, "Arial");
   Label("SAFETY2", 24, 423, "BE +6 | PARTIAL +10 (1/3)", clrSilver, 9, "Arial");
}

void DrawInfoPair(const string id, const int xLabel, const int xValue, const int y, const string label, const string value, const color valueColor)
{
   Label(id + "L", xLabel, y, label, clrSilver, 10, "Arial");
   Label(id + "V", xValue, y, value, valueColor, 10, "Arial");
}

void DrawReasonBlock(const string suffix, const int y, const string title, const string sourceText, const int maxChars)
{
   string line1, line2, line3;
   ReasonLines(sourceText, maxChars, line1, line2, line3);
   Rectangle(suffix + "BOX", 12, y, 536, 82, C'22,27,36', C'50,63,80');
   Label(suffix + "HEAD", 22, y + 10, title, clrDeepSkyBlue, 11, "Arial");
   Label(suffix + "L1", 30, y + 36, "- " + line1, clrWhite, 10, "Arial");
   Label(suffix + "L2", 30, y + 58, StringLen(line2) > 0 ? "- " + line2 : " ", clrSilver, 10, "Arial");
}

void RenderWaiting(const string payload)
{
   string activeMode = CleanValue(Field(payload, "activeMode"));
   string strategy = CleanValue(Field(payload, "effectiveStrategy"));
   string regime = CleanValue(Field(payload, "regime"));
   string confidence = CleanValue(Field(payload, "confidence"));
   string stage = CleanValue(Field(payload, "stage"));
   string entryReason = Field(payload, "entryReason");
   string holdReason = Field(payload, "holdReason");
   string stateText = stage == "BLOCKED" ? "DANG CHO SETUP" : "DANG THEO DOI THI TRUONG";
   color stateColor = stage == "BLOCKED" ? clrOrange : clrGold;

   DrawBase();
   DrawHeader(activeMode, strategy, regime, confidence);

   Rectangle("STATUS", 12, 112, 536, 62, C'24,33,43', stateColor);
   Label("STATUS_TITLE", 24, 123, stateText, stateColor, 14, "Arial");
   Label("STATUS_NOTE", 24, 150, "Stage: " + stage + " | Khong co lenh moi", clrWhite, 10, "Arial");

   DrawReasonBlock("REASON", 188, "LY DO CHO", entryReason + "\n" + holdReason, 62);

   Rectangle("RULES", 12, 284, 536, 104, C'22,27,36', C'50,63,80');
   Label("RULES_HEAD", 22, 294, "QUY TAC LENH", clrDeepSkyBlue, 11, "Arial");
   Label("RULE1", 30, 320, "- SL chuan: 6-10 gia", clrWhite, 10, "Arial");
   Label("RULE2", 30, 342, "- Neu SL > 10 gia: cho pullback sau M15", clrWhite, 10, "Arial");
   Label("RULE3", 30, 364, "- BE: +6 | Partial: +10, chot 1/3", clrSilver, 10, "Arial");

   DrawFooter();
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
   string stateText = "SETUP HOP LE";

   DrawBase();
   DrawHeader(activeMode, strategy, regime, confidence);
   Rectangle("STATUS", 12, 112, 536, 54, C'24,33,43', clrLimeGreen);
   Label("STATUS_TITLE", 24, 122, stateText, clrLimeGreen, 13, "Arial");
   Label("STATUS_NOTE", 24, 146, "Stage: " + stage + " | Cho entry gate", clrWhite, 10, "Arial");

   Rectangle("PLAN", 12, 182, 536, 128, C'22,27,36', C'50,63,80');
   Label("PLAN_HEAD", 22, 192, "KE HOACH LENH", clrDeepSkyBlue, 11, "Arial");
   DrawInfoPair("P1", 30, 145, 220, "Diem vao", entry, clrWhite);
   DrawInfoPair("P2", 30, 145, 242, "Stoploss", stopLoss, clrTomato);
   DrawInfoPair("P3", 30, 145, 264, "Khoang SL", distance, clrWhite);
   DrawInfoPair("P4", 30, 145, 286, "Lot", volume, clrAqua);
   DrawInfoPair("Q1", 305, 420, 220, "TP1", tp1, clrLimeGreen);
   DrawInfoPair("Q2", 305, 420, 242, "TP2", tp2, clrLimeGreen);
   DrawInfoPair("Q3", 305, 420, 264, "Huong", side, clrGold);
   DrawInfoPair("Q4", 305, 420, 286, "Risk USD", riskUsd, clrSilver);

   DrawReasonBlock("REASON", 322, "LY DO VAO LENH", Field(payload, "entryReason"), 62);
   DrawFooter();
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

   DrawBase();
   DrawHeader(activeMode, strategy, regime, confidence);
   Rectangle("STATUS", 12, 112, 536, 54, C'24,33,43', clrLimeGreen);
   Label("STATUS_TITLE", 24, 122, "DANG GIU VI THE " + side, clrLimeGreen, 13, "Arial");
   Label("STATUS_NOTE", 24, 146, "Ticket: " + ticket + " | P/L: " + pnl + " USD", ProfitColor(pnl), 10, "Arial");

   Rectangle("PLAN", 12, 182, 536, 128, C'22,27,36', C'50,63,80');
   Label("PLAN_HEAD", 22, 192, "VI THE DANG MO", clrDeepSkyBlue, 11, "Arial");
   DrawInfoPair("P1", 30, 145, 220, "Entry", entry, clrWhite);
   DrawInfoPair("P2", 30, 145, 242, "Gia hien tai", current, clrWhite);
   DrawInfoPair("P3", 30, 145, 264, "Stoploss", stopLoss, clrTomato);
   DrawInfoPair("P4", 30, 145, 286, "Lot", volume, clrAqua);
   DrawInfoPair("Q1", 305, 420, 220, "TP1", tp1, clrLimeGreen);
   DrawInfoPair("Q2", 305, 420, 242, "TP2", tp2, clrLimeGreen);
   DrawInfoPair("Q3", 305, 420, 264, "BE", CleanValue(Field(payload, "breakEvenApplied")), clrGold);
   DrawInfoPair("Q4", 305, 420, 286, "Partial", CleanValue(Field(payload, "partialApplied")), clrGold);

   DrawReasonBlock("REASON", 322, "LY DO GIU LENH", Field(payload, "holdReason"), 62);
   DrawFooter();
   ChartRedraw();
}

void RenderError(const string title, const string message, const bool showWebRequestHelp)
{
   DrawBase();
   Rectangle("STATUS", 12, 58, 536, 70, C'55,30,30', C'210,70,70');
   Rectangle("RECOVERY", 12, 145, 536, 150, C'22,27,36', C'50,63,80');
   Rectangle("FOOT", 12, 310, 536, 42, C'18,23,31', C'42,54,69');
   Label("TITLE", 22, 17, "XAUUSD AI MASTER", clrDeepSkyBlue, 14, "Arial");
   Label("SUBTITLE", 22, 42, "Phase 7C | DEMO | READ ONLY", clrSilver, 10, "Arial");
   Label("STATUS_TITLE", 26, 72, title, clrTomato, 12, "Arial");
   Label("STATUS_NOTE", 26, 98, message, clrWhite, 10, "Arial");
   Label("RECOVERY_HEAD", 26, 158, "HUONG DAN PHUC HOI", clrDeepSkyBlue, 11, "Arial");
   if(showWebRequestHelp)
   {
      Label("HELP1", 30, 188, "1. Tools > Options > Expert Advisors", clrWhite, 10, "Arial");
      Label("HELP2", 30, 212, "2. Allow WebRequest: http://127.0.0.1:3711", clrGold, 10, "Arial");
      Label("HELP3", 30, 236, "3. Attach lai EA panel", clrSilver, 10, "Arial");
   }
   else
   {
      Label("HELP1", 30, 188, "API/Bridge dang khoi tao hoac tam thoi loi.", clrWhite, 10, "Arial");
      Label("HELP2", 30, 212, "Panel tu dong tai lai moi " + IntegerToString(InpRefreshSeconds) + " giay.", clrGold, 10, "Arial");
   }
   Label("SAFETY1", 26, 320, "READ ONLY | DEMO | ORDER PERMISSION = NONE", clrSilver, 9, "Arial");
   Label("SAFETY2", 26, 337, "Khong co quyen gui lenh tu panel.", clrSilver, 9, "Arial");
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
