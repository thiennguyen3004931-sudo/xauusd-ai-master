#property copyright "XAUUSD AI MASTER"
#property version   "1.21"
#property description "Read-only Phase 7C synchronized position and decision panel"

input string InpApiUrl = "http://127.0.0.1:3711/api/v1/phase7c/decision-monitor/mt5?symbol=XAUUSD";
input int InpRefreshSeconds = 3;
input ENUM_BASE_CORNER InpCorner = CORNER_LEFT_UPPER;
input int InpX = 12;
input int InpY = 28;
input int InpFontSize = 10;

const string PREFIX = "XAU_AI_P7C_";
const int PANEL_WIDTH = 560;
const int PANEL_HEIGHT = 482;
bool g_error_mode = false;

string TrimText(const string value)
{
   string copy = value;
   StringTrimLeft(copy);
   StringTrimRight(copy);
   return copy;
}

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

string Friendly(const string raw, const string fallback = "Chua co")
{
   string value = TrimText(raw);
   if(value == "" || value == "n/a" || value == "null" || value == "undefined" || value == "NaN")
      return fallback;
   return value;
}

string BoolLabel(const string raw)
{
   string value = TrimText(raw);
   if(value == "true" || value == "True" || value == "1")
      return "Da bat";
   if(value == "false" || value == "False" || value == "0")
      return "Chua";
   return "Chua co";
}

string DirectionLabel(const string raw)
{
   string value = TrimText(raw);
   if(value == "BUY" || value == "LONG")
      return "MUA";
   if(value == "SELL" || value == "SHORT")
      return "BAN";
   return Friendly(value, "Chua co");
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
   if(ObjectFind(0, name) < 0)
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
   if(ObjectFind(0, name) < 0)
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

void TakeWrappedLine(const string value, const int maximum, string &line, string &remaining)
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

void WrapThree(const string value, const int maximum, string &first, string &second, string &third)
{
   string text = Friendly(value, "Chua co ly do.");
   string remaining;
   TakeWrappedLine(text, maximum, first, remaining);
   TakeWrappedLine(remaining, maximum, second, third);
   if(StringLen(third) > maximum)
      third = StringSubstr(third, 0, maximum - 3) + "...";
}

color StatusColor(const string positionState, const string stage, const string approved)
{
   if(positionState == "MANAGING")
      return clrLimeGreen;
   if(stage == "BLOCKED")
      return clrOrange;
   if(positionState == "UNMANAGED" || stage == "ERROR")
      return clrTomato;
   if(approved == "true")
      return clrLimeGreen;
   return clrGold;
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

void BeginLayout(const bool errorMode)
{
   if(g_error_mode != errorMode)
      DeletePanel();
   g_error_mode = errorMode;
   Rectangle("BG", 0, 0, PANEL_WIDTH, errorMode ? 328 : PANEL_HEIGHT, C'13,18,26', C'60,74,92');
   Rectangle("TOP", 0, 0, PANEL_WIDTH, 5, C'28,178,224', C'28,178,224');
}

void DrawNormalChrome()
{
   BeginLayout(false);
   Rectangle("STATUS", 12, 58, 536, 54, C'24,33,43', C'58,73,92');
   Rectangle("PLAN", 12, 135, 536, 130, C'21,27,36', C'50,63,80');
   Rectangle("ENTRY_REASON", 12, 292, 536, 62, C'21,27,36', C'50,63,80');
   Rectangle("HOLD_REASON", 12, 382, 536, 62, C'21,27,36', C'50,63,80');
   Rectangle("FOOT", 12, 452, 536, 20, C'18,23,31', C'42,54,69');
}

void RenderError(const string title, const string message, const bool showWebRequestHelp)
{
   BeginLayout(true);
   Rectangle("STATUS", 12, 58, 536, 64, C'55,30,30', C'210,70,70');
   Rectangle("RECOVERY", 12, 138, 536, 124, C'21,27,36', C'50,63,80');
   Rectangle("FOOT", 12, 278, 536, 34, C'18,23,31', C'42,54,69');

   Label("TITLE", 18, 15, "XAUUSD AI MASTER", clrDeepSkyBlue, InpFontSize + 5, "Arial");
   Label("SUBTITLE", 18, 39, "PHASE 7C | READ ONLY | DEMO", clrSilver, InpFontSize);
   Label("STATUS_TITLE", 26, 70, title, clrTomato, InpFontSize + 2, "Arial");
   Label("STATUS_NOTE", 26, 96, message, clrWhite, InpFontSize);

   Label("RECOVERY_HEAD", 26, 153, "KHOI PHUC KET NOI", clrDeepSkyBlue, InpFontSize + 1, "Arial");
   if(showWebRequestHelp)
   {
      Label("HELP1", 28, 184, "1. Tools > Options > Expert Advisors", clrWhite);
      Label("HELP2", 28, 207, "2. Allow WebRequest: http://127.0.0.1:3711", clrGold);
      Label("HELP3", 28, 230, "3. Giu API/Web/Bridge dang chay", clrSilver);
   }
   else
   {
      Label("HELP1", 28, 184, "API/Bridge dang khoi tao hoac tra du lieu cu.", clrWhite);
      Label("HELP2", 28, 207, "Panel tu tai lai moi " + IntegerToString(InpRefreshSeconds) + " giay.", clrGold);
      Label("HELP3", 28, 230, "Khong gui lenh tu panel MT5.", clrSilver);
   }
   Label("SAFETY", 26, 288, "READ ONLY | DEMO | ORDER PERMISSION = NONE", clrSilver);
   ChartRedraw();
}

void Render(const string payload)
{
   string positionState = Field(payload, "positionState");
   string stage = Field(payload, "stage");
   string approved = Field(payload, "approved");
   string activeMode = Field(payload, "activeMode");
   string regime = Field(payload, "regime");
   string confidence = Field(payload, "confidence");
   string strategy = Field(payload, "effectiveStrategy");
   color stateColor = StatusColor(positionState, stage, approved);
   bool managing = positionState == "MANAGING" || positionState == "UNMANAGED";

   string entry = managing ? Field(payload, "positionEntry") : Field(payload, "entry");
   string current = managing ? Field(payload, "currentPrice") : "";
   string stopLoss = managing ? Field(payload, "positionStopLoss") : Field(payload, "stopLoss");
   string tp1 = managing ? Field(payload, "positionTp1") : Field(payload, "tp1");
   string tp2 = managing ? Field(payload, "positionTp2") : Field(payload, "tp2");
   string volume = managing ? Field(payload, "positionVolume") : Field(payload, "finalLot");
   string pnl = managing ? Field(payload, "floatingPnlUsd") : Field(payload, "estimatedRiskUsd");
   string side = managing ? Field(payload, "positionSide") : Field(payload, "side");
   string setup = managing ? Field(payload, "positionSetup") : Field(payload, "setup");
   string ticket = managing ? Field(payload, "ticket") : "";
   string distance = managing ? Field(payload, "favorableDistance") : Field(payload, "stopDistance");
   string bePartial = "BE " + BoolLabel(Field(payload, "breakEvenApplied")) + " / 1-3 " + BoolLabel(Field(payload, "partialApplied"));

   string entryLine1, entryLine2, entryLine3, holdLine1, holdLine2, holdLine3;
   WrapThree(Field(payload, "entryReason"), 70, entryLine1, entryLine2, entryLine3);
   WrapThree(Field(payload, "holdReason"), 70, holdLine1, holdLine2, holdLine3);

   string statusTitle;
   string statusNote;
   if(positionState == "MANAGING")
   {
      statusTitle = "DANG GIU LENH " + DirectionLabel(side) + " | " + Friendly(strategy, "Quan ly");
      statusNote = "Ticket " + Friendly(ticket) + " | Lot " + Friendly(volume) + " | P/L " + Friendly(pnl, "0") + " USD";
   }
   else if(positionState == "UNMANAGED")
   {
      statusTitle = "CAN KIEM TRA LENH NGOAI EXECUTOR";
      statusNote = "Ticket " + Friendly(ticket) + " | panel chi doc, khong tu quan ly";
   }
   else
   {
      statusTitle = approved == "true" ? "SETUP HOP LE | CHO EXECUTOR" : "DANG CHO SETUP";
      statusNote = "Stage " + Friendly(stage) + " | Mode " + Friendly(activeMode) + " -> " + Friendly(strategy, "PAUSE");
   }

   DrawNormalChrome();
   Rectangle("STATUS", 12, 58, 536, 54, C'24,33,43', stateColor);

   Label("TITLE", 18, 15, "XAUUSD AI MASTER", clrDeepSkyBlue, InpFontSize + 5, "Arial");
   Label("SUBTITLE", 18, 40, "Phase 7C | DEMO | READ ONLY", clrSilver, InpFontSize);
   Label("MODE", 382, 15, "MODE  " + Friendly(activeMode), clrWhite, InpFontSize + 1, "Consolas");
   Label("REGIME", 382, 40, Friendly(regime) + " | CONF " + Friendly(confidence), clrSilver, InpFontSize, "Consolas");

   Label("STATUS_TITLE", 26, 70, statusTitle, stateColor, InpFontSize + 2, "Arial");
   Label("STATUS_NOTE", 26, 94, statusNote, clrWhite, InpFontSize, "Arial");

   Label("SECTION_PLAN", 18, 120, managing ? "LENH DANG QUAN LY" : "KE HOACH LENH KE TIEP", clrDeepSkyBlue, InpFontSize + 1, "Arial");

   Label("L1", 28, 150, "Diem vao", clrSilver, InpFontSize, "Arial");
   Label("L1V", 135, 150, Friendly(entry, "Dang cho"), clrWhite, InpFontSize + 1, "Consolas");
   Label("R1", 292, 150, "TP1", clrSilver, InpFontSize, "Arial");
   Label("R1V", 390, 150, Friendly(tp1), clrLimeGreen, InpFontSize + 1, "Consolas");

   Label("L2", 28, 172, managing ? "Gia hien tai" : "Stoploss", clrSilver, InpFontSize, "Arial");
   Label("L2V", 135, 172, Friendly(managing ? current : stopLoss), managing ? clrWhite : clrTomato, InpFontSize + 1, "Consolas");
   Label("R2", 292, 172, "TP2", clrSilver, InpFontSize, "Arial");
   Label("R2V", 390, 172, Friendly(tp2), clrLimeGreen, InpFontSize + 1, "Consolas");

   Label("L3", 28, 194, "Khoang SL", clrSilver, InpFontSize, "Arial");
   Label("L3V", 135, 194, Friendly(distance), clrWhite, InpFontSize + 1, "Consolas");
   Label("R3", 292, 194, "Huong", clrSilver, InpFontSize, "Arial");
   Label("R3V", 390, 194, DirectionLabel(side), stateColor, InpFontSize + 1, "Consolas");

   Label("L4", 28, 216, "Lot", clrSilver, InpFontSize, "Arial");
   Label("L4V", 135, 216, Friendly(volume), clrAqua, InpFontSize + 1, "Consolas");
   Label("R4", 292, 216, "Setup", clrSilver, InpFontSize, "Arial");
   Label("R4V", 390, 216, Friendly(setup), clrWhite, InpFontSize, "Consolas");

   Label("L5", 28, 238, managing ? "P/L USD" : "Risk USD", clrSilver, InpFontSize, "Arial");
   Label("L5V", 135, 238, Friendly(pnl), ProfitColor(pnl), InpFontSize + 1, "Consolas");
   Label("R5", 292, 238, "BE/Partial", clrSilver, InpFontSize, "Arial");
   Label("R5V", 390, 238, bePartial, clrAqua, InpFontSize, "Consolas");

   Label("ENTRY_HEAD", 20, 276, "LY DO VAO LENH / CHO LENH", clrDeepSkyBlue, InpFontSize + 1, "Arial");
   Label("ENTRY_1", 28, 307, "• " + entryLine1, clrWhite, InpFontSize, "Arial");
   Label("ENTRY_2", 28, 326, StringLen(entryLine2) > 0 ? "• " + entryLine2 : " ", clrSilver, InpFontSize, "Arial");
   Label("ENTRY_3", 28, 345, StringLen(entryLine3) > 0 ? "• " + entryLine3 : " ", clrSilver, InpFontSize, "Arial");

   Label("HOLD_HEAD", 20, 366, "LY DO GIU / CHO LENH", clrDeepSkyBlue, InpFontSize + 1, "Arial");
   Label("HOLD_1", 28, 397, "• " + holdLine1, managing ? clrWhite : clrSilver, InpFontSize, "Arial");
   Label("HOLD_2", 28, 416, StringLen(holdLine2) > 0 ? "• " + holdLine2 : " ", clrSilver, InpFontSize, "Arial");
   Label("HOLD_3", 28, 435, StringLen(holdLine3) > 0 ? "• " + holdLine3 : " ", clrSilver, InpFontSize, "Arial");

   Label("SAFETY", 24, 454, "READ ONLY | DEMO | ORDER PERMISSION = NONE | BE +6 | PARTIAL 1/3 @ +10", clrSilver, InpFontSize - 1, "Consolas");
   ChartRedraw();
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
