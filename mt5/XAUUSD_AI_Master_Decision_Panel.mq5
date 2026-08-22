#property copyright "XAUUSD AI MASTER"
#property version   "1.27"
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
   StringReplace(text, "PAUSE chan moi lenh moi; khong thay doi vi the dang quan ly.", "PAUSE chan lenh moi; khong doi vi the dang quan ly.");
   StringReplace(text, "A confirmed CHOCH indicates a possible structural reversal.", "CHOCH xac nhan kha nang dao chieu.");
   StringReplace(text, "Bollinger bandwidth is", "Bollinger bandwidth:");
   StringReplace(text, "No valid setup", "Chua co setup hop le");
   StringReplace(text, "panel does not have order permission", "panel chi doc, khong gui lenh");
   StringReplace(text, "panel khong co quyen gui lenh", "panel chi doc, khong gui lenh");
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

void Label(const string suffix, const int x, const int y, const string text, const color textColor, const int fontSize)
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
   ObjectSetString(0, name, OBJPROP_FONT, "Arial");
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

void DrawBase(const int height)
{
   DeletePanel();
   Rectangle("BG", 0, 0, PANEL_WIDTH, height, C'13,18,26', C'77,95,120');
   Rectangle("TOP", 0, 0, PANEL_WIDTH, 4, C'36,184,224', C'36,184,224');
}

void DrawHeader(const string activeMode, const string strategy, const string regime, const string confidence)
{
   Rectangle("HEAD", 12, 10, 596, 92, C'16,22,31', C'44,58,76');
   Label("TITLE", 22, 17, "XAUUSD AI MASTER", clrDeepSkyBlue, 15);
   Label("UI", 540, 19, "UI v5", clrGold, 9);
   Label("SUBTITLE", 22, 43, "Phase 7C | DEMO | READ ONLY", clrSilver, 10);
   Label("MODE", 22, 68, "Mode: " + activeMode + " -> " + strategy, activeMode == "AUTO" ? clrLimeGreen : clrGold, 10);
   Label("REGIME", 326, 68, "Regime: " + regime + " | Conf: " + confidence, RegimeColor(regime), 10);
}

void DrawFooter(const int y)
{
   Rectangle("FOOT", 12, y, 596, 46, C'18,23,31', C'42,54,69');
   Label("SAFETY1", 24, y + 9, "READ ONLY | DEMO | ORDER PERMISSION = NONE", clrSilver, 9);
   Label("SAFETY2", 24, y + 27, "BE +6 | PARTIAL +10 (1/3)", clrSilver, 9);
}

void DrawInfoPair(const string id, const int xLabel, const int xValue, const int y, const string label, const string value, const color valueColor)
{
   Label(id + "L", xLabel, y, label, clrSilver, 10);
   Label(id + "V", xValue, y, value, valueColor, 10);
}

void DrawReasonBlock(const string suffix, const int y, const string title, const string sourceText, const int maxChars)
{
   string line1, line2, line3;
   ReasonLines(sourceText, maxChars, line1, line2, line3);
   Rectangle(suffix + "BOX", 12, y, 596, 106, C'22,27,36', C'50,63,80');
   Label(suffix + "HEAD", 22, y + 12, title, clrDeepSkyBlue, 11);
   Label(suffix + "L1", 30, y + 42, "- " + line1, clrWhite, 10);
   Label(suffix + "L2", 30, y + 66, StringLen(line2) > 0 ? "- " + line2 : " ", clrSilver, 10);
   Label(suffix + "L3", 30, y + 90, StringLen(line3) > 0 ? "- " + line3 : " ", clrSilver, 10);
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
   string limitReason = Field(payload, "limitReason");
   string stateText = stage == "BLOCKED" ? "BOT DANG CHO SETUP" : "DANG THEO DOI THI TRUONG";
   color stateColor = stage == "BLOCKED" ? clrOrange : clrGold;

   DrawBase(430);
   DrawHeader(activeMode, strategy, regime, confidence);

   Rectangle("STATUS", 12, 116, 596, 66, C'24,33,43', stateColor);
   Label("STATUS_TITLE", 24, 128, stateText, stateColor, 14);
   Label("STATUS_NOTE", 24, 156, "Stage: " + stage + " | Khong mo lenh moi", clrWhite, 10);

   DrawReasonBlock("REASON", 196, "LY DO CHO", limitReason + "\n" + entryReason + "\n" + holdReason, 68);

   Rectangle("RULES", 12, 316, 596, 62, C'22,27,36', C'50,63,80');
   Label("RULES_HEAD", 22, 326, "QUY TAC GIAO DICH", clrDeepSkyBlue, 11);
   Label("RULE1", 30, 352, "SL 6-10 gia | SL > 10: cho pullback M15 | BE +6 | Partial +10 1/3", clrWhite, 10);

   DrawFooter(388);
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

   DrawBase(470);
   DrawHeader(activeMode, strategy, regime, confidence);
   Rectangle("STATUS", 12, 116, 596, 58, C'24,33,43', clrLimeGreen);
   Label("STATUS_TITLE", 24, 128, "SETUP HOP LE", clrLimeGreen, 14);
   Label("STATUS_NOTE", 24, 154, "Stage: " + stage + " | Cho entry gate", clrWhite, 10);

   Rectangle("PLAN", 12, 190, 596, 132, C'22,27,36', C'50,63,80');
   Label("PLAN_HEAD", 22, 202, "KE HOACH LENH", clrDeepSkyBlue, 11);
   DrawInfoPair("P1", 30, 145, 232, "Diem vao", entry, clrWhite);
   DrawInfoPair("P2", 30, 145, 256, "Stoploss", stopLoss, clrTomato);
   DrawInfoPair("P3", 30, 145, 280, "Khoang SL", distance, clrWhite);
   DrawInfoPair("P4", 30, 145, 304, "Lot", volume, clrAqua);
   DrawInfoPair("Q1", 330, 445, 232, "TP1", tp1, clrLimeGreen);
   DrawInfoPair("Q2", 330, 445, 256, "TP2", tp2, clrLimeGreen);
   DrawInfoPair("Q3", 330, 445, 280, "Huong", side, clrGold);
   DrawInfoPair("Q4", 330, 445, 304, "Risk USD", riskUsd, clrSilver);

   DrawReasonBlock("REASON", 336, "LY DO VAO LENH", Field(payload, "entryReason"), 68);
   DrawFooter(426);
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
   string be = CleanValue(Field(payload, "breakEvenApplied"));
   string partial = CleanValue(Field(payload, "partialApplied"));

   DrawBase(470);
   DrawHeader(activeMode, strategy, regime, confidence);
   Rectangle("STATUS", 12, 116, 596, 58, C'24,33,43', clrLimeGreen);
   Label("STATUS_TITLE", 24, 128, "DANG GIU LENH " + side, clrLimeGreen, 14);
   Label("STATUS_NOTE", 24, 154, "Ticket: " + ticket + " | Lot: " + volume, clrWhite, 10);

   Rectangle("POS", 12, 190, 596, 132, C'22,27,36', C'50,63,80');
   Label("POS_HEAD", 22, 202, "VI THE DANG MO", clrDeepSkyBlue, 11);
   DrawInfoPair("M1", 30, 150, 232, "Entry", entry, clrWhite);
   DrawInfoPair("M2", 30, 150, 256, "Gia hien tai", current, clrWhite);
   DrawInfoPair("M3", 30, 150, 280, "Stoploss", stopLoss, clrTomato);
   DrawInfoPair("M4", 30, 150, 304, "P/L USD", pnl, ProfitColor(pnl));
   DrawInfoPair("N1", 330, 445, 232, "TP1", tp1, clrLimeGreen);
   DrawInfoPair("N2", 330, 445, 256, "TP2", tp2, clrLimeGreen);
   DrawInfoPair("N3", 330, 445, 280, "BE", be, clrAqua);
   DrawInfoPair("N4", 330, 445, 304, "Partial", partial, clrAqua);

   DrawReasonBlock("HOLD", 336, "LY DO GIU LENH", Field(payload, "holdReason"), 68);
   DrawFooter(426);
   ChartRedraw();
}

void RenderError(const string title, const string message, const bool webRequestHelp)
{
   DrawBase(330);
   Rectangle("STATUS", 12, 58, 596, 70, C'55,30,30', C'210,70,70');
   Rectangle("HELP", 12, 146, 596, 120, C'22,27,36', C'50,63,80');
   Label("TITLE", 22, 18, "XAUUSD AI MASTER", clrDeepSkyBlue, 15);
   Label("UI", 540, 20, "UI v5", clrGold, 9);
   Label("STATUS_TITLE", 24, 72, title, clrTomato, 13);
   Label("STATUS_NOTE", 24, 100, message, clrWhite, 10);
   Label("HELP_HEAD", 24, 162, "HUONG DAN", clrDeepSkyBlue, 11);
   if(webRequestHelp)
   {
      Label("HELP1", 32, 190, "1. Tools > Options > Expert Advisors", clrWhite, 10);
      Label("HELP2", 32, 214, "2. Allow WebRequest: http://127.0.0.1:3711", clrGold, 10);
      Label("HELP3", 32, 238, "3. Attach lai EA panel vao chart XAUUSD", clrSilver, 10);
   }
   else
   {
      Label("HELP1", 32, 190, "API/Bridge dang khoi dong hoac tra du lieu tam thoi loi.", clrWhite, 10);
      Label("HELP2", 32, 214, "Panel tu dong tai lai moi vai giay.", clrGold, 10);
      Label("HELP3", 32, 238, "Giu MT5 va Control API dang chay.", clrSilver, 10);
   }
   DrawFooter(276);
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
