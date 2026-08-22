#property copyright "XAUUSD AI MASTER"
#property version   "1.23"
#property description "Read-only Phase 7C compact synchronized position and decision panel"

input string InpApiUrl = "http://127.0.0.1:3711/api/v1/phase7c/decision-monitor/mt5?symbol=XAUUSD";
input int InpRefreshSeconds = 3;
input ENUM_BASE_CORNER InpCorner = CORNER_LEFT_UPPER;
input int InpX = 12;
input int InpY = 28;
input int InpFontSize = 9;

const string PREFIX = "XAU_AI_P7C_";
const int PANEL_WIDTH = 720;
const int PANEL_HEIGHT = 516;
// Required installer safety marker: READ ONLY | DEMO | ORDER PERMISSION = NONE
bool g_error_mode = false;

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

string CompactReason(const string value)
{
   string text = value;
   StringReplace(text, "A confirmed CHOCH indicates a possible structural reversal.", "CHOCH xac nhan kha nang dao chieu.");
   StringReplace(text, "Bollinger bandwidth is", "Bollinger bandwidth:");
   StringReplace(text, "No valid setup", "Chua co setup hop le");
   StringReplace(text, "panel does not have order permission", "panel chi doc, khong gui lenh");
   StringReplace(text, "panel khong co quyen gui lenh", "panel chi doc, khong gui lenh");
   StringReplace(text, " | ", ". ");
   StringReplace(text, " • ", "\n");
   StringReplace(text, "• ", "");
   return text;
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
   string compact = CompactReason(value);
   string parts[];
   ushort separator = (ushort)StringGetCharacter("\n", 0);
   int count = StringSplit(compact, separator, parts);

   if(count >= 2)
   {
      first = Clip(parts[0], maximum);
      second = Clip(parts[1], maximum);
      third = count >= 3 ? Clip(parts[2], maximum) : "";
      return;
   }

   string remaining;
   TakeWrappedLine(compact, maximum, first, remaining);
   TakeWrappedLine(remaining, maximum, second, third);
   if(StringLen(third) > maximum)
      third = StringSubstr(third, 0, maximum - 3) + "...";
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

void Label(const string suffix, const int x, const int y, const string text, const color textColor = clrWhite, const int fontSize = 0, const string font = "Consolas")
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

void BeginLayout(const bool errorMode)
{
   if(g_error_mode != errorMode)
      DeletePanel();
   g_error_mode = errorMode;
   Rectangle("BG", 0, 0, PANEL_WIDTH, errorMode ? 360 : PANEL_HEIGHT, C'14,18,25', C'71,86,106');
   Rectangle("TOP", 0, 0, PANEL_WIDTH, 4, C'36,184,224', C'36,184,224');
}

void DrawNormalChrome()
{
   BeginLayout(false);
   Rectangle("HEAD", 12, 10, 696, 72, C'16,22,31', C'44,58,76');
   Rectangle("STATUS", 12, 92, 696, 54, C'24,33,43', C'58,73,92');
   Rectangle("PLAN", 12, 174, 696, 136, C'22,27,36', C'50,63,80');
   Rectangle("ENTRY_REASON", 12, 344, 696, 68, C'22,27,36', C'50,63,80');
   Rectangle("HOLD_REASON", 12, 438, 696, 48, C'22,27,36', C'50,63,80');
   Rectangle("FOOT", 12, 498, 696, 18, C'18,23,31', C'42,54,69');
}

void RenderError(const string title, const string message, const bool showWebRequestHelp)
{
   BeginLayout(true);
   Rectangle("STATUS", 12, 58, 696, 64, C'55,30,30', C'210,70,70');
   Rectangle("RECOVERY", 12, 138, 696, 150, C'22,27,36', C'50,63,80');
   Rectangle("FOOT", 12, 304, 696, 42, C'18,23,31', C'42,54,69');

   Label("TITLE", 20, 16, "XAUUSD AI MASTER", clrDeepSkyBlue, InpFontSize + 2, "Arial");
   Label("SUBTITLE", 20, 39, "Phase 7C | DEMO | READ ONLY", clrSilver, InpFontSize);
   Label("STATUS_TITLE", 26, 70, title, clrTomato, InpFontSize + 2, "Arial");
   Label("STATUS_NOTE", 26, 96, message, clrWhite, InpFontSize);

   Label("RECOVERY_HEAD", 26, 153, "HUONG DAN PHUC HOI", clrDeepSkyBlue, InpFontSize + 1, "Arial");
   if(showWebRequestHelp)
   {
      Label("HELP1", 28, 185, "1. Tools > Options > Expert Advisors", clrWhite);
      Label("HELP2", 28, 210, "2. Allow WebRequest: http://127.0.0.1:3711", clrGold);
      Label("HELP3", 28, 235, "3. Attach lai EA panel neu chart chua cap nhat", clrSilver);
   }
   else
   {
      Label("HELP1", 28, 185, "API/Bridge dang khoi tao hoac tra du lieu tam thoi loi.", clrWhite);
      Label("HELP2", 28, 210, "Panel tu dong tai lai moi " + IntegerToString(InpRefreshSeconds) + " giay.", clrGold);
      Label("HELP3", 28, 235, "Giu MT5 va Control API dang chay.", clrSilver);
   }
   Label("SAFETY1", 26, 314, "READ ONLY | DEMO | ORDER PERMISSION = NONE", clrSilver);
   Label("SAFETY2", 26, 333, "Khong co quyen gui lenh tu panel.", clrSilver);
   ChartRedraw();
}

void DrawInfoPair(const string id, const int xLabel, const int xValue, const int y, const string label, const string value, const color valueColor)
{
   Label(id + "L", xLabel, y, label, clrSilver, InpFontSize);
   Label(id + "V", xValue, y, value, valueColor, InpFontSize);
}

void Render(const string payload)
{
   string positionState = Field(payload, "positionState");
   string stage = Field(payload, "stage");
   string approved = Field(payload, "approved");
   bool managing = positionState == "MANAGING" || positionState == "UNMANAGED";
   color stateColor = StatusColor(positionState, stage, approved);

   string activeMode = CleanValue(Field(payload, "activeMode"));
   string effectiveStrategy = CleanValue(Field(payload, "effectiveStrategy"));
   string regime = CleanValue(Field(payload, "regime"));
   string confidence = CleanValue(Field(payload, "confidence"));

   string entry = CleanValue(managing ? Field(payload, "positionEntry") : Field(payload, "entry"));
   string current = CleanValue(managing ? Field(payload, "currentPrice") : "n/a");
   string stopLoss = CleanValue(managing ? Field(payload, "positionStopLoss") : Field(payload, "stopLoss"));
   string tp1 = CleanValue(managing ? Field(payload, "positionTp1") : Field(payload, "tp1"));
   string tp2 = CleanValue(managing ? Field(payload, "positionTp2") : Field(payload, "tp2"));
   string volume = CleanValue(managing ? Field(payload, "positionVolume") : Field(payload, "finalLot"));
   string pnl = CleanValue(managing ? Field(payload, "floatingPnlUsd") : Field(payload, "estimatedRiskUsd"));
   string strategy = managing ? CleanValue(Field(payload, "positionStrategy")) : effectiveStrategy;
   string side = CleanValue(managing ? Field(payload, "positionSide") : Field(payload, "side"));
   string setup = CleanValue(managing ? Field(payload, "positionSetup") : Field(payload, "setup"));
   string ticket = CleanValue(managing ? Field(payload, "ticket") : "n/a");
   string distance = CleanValue(managing ? Field(payload, "favorableDistance") : Field(payload, "stopDistance"));

   string entryLine1, entryLine2, entryLine3, holdLine1, holdLine2, holdLine3;
   WrapThree(Field(payload, "entryReason"), 62, entryLine1, entryLine2, entryLine3);
   WrapThree(Field(payload, "holdReason"), 62, holdLine1, holdLine2, holdLine3);

   string statusTitle;
   string statusNote;
   if(positionState == "MANAGING")
   {
      statusTitle = "DANG GIU VI THE " + side;
      statusNote = "Ticket " + ticket + " | " + volume + " lot | P/L " + pnl + " USD";
   }
   else if(positionState == "UNMANAGED")
   {
      statusTitle = "CAN KIEM TRA VI THE NGOAI BOT";
      statusNote = "Ticket " + ticket + " | panel chi doc, khong tu quan ly";
   }
   else
   {
      statusTitle = approved == "true" ? "SETUP HOP LE" : "DANG CHO SETUP";
      statusNote = "Stage: " + CleanValue(stage) + " | Mode: " + activeMode + " -> " + strategy;
   }

   string bePartial = "BE +6 / +10 1/3";
   if(managing)
      bePartial = "BE " + CleanValue(Field(payload, "breakEvenApplied")) + " / 1/3 " + CleanValue(Field(payload, "partialApplied"));

   DrawNormalChrome();
   Rectangle("STATUS", 12, 92, 696, 54, C'24,33,43', stateColor);

   Label("TITLE", 22, 16, "XAUUSD AI MASTER", clrDeepSkyBlue, InpFontSize + 2, "Arial");
   Label("SUBTITLE", 22, 39, "Phase 7C | DEMO | READ ONLY", clrSilver, InpFontSize);
   Label("HM1", 22, 62, "Mode: " + activeMode + " -> " + strategy, activeMode == "AUTO" ? clrLimeGreen : clrGold, InpFontSize);
   Label("HM2", 350, 62, "Regime: " + regime + " | Conf: " + confidence, RegimeColor(regime), InpFontSize);

   Label("STATUS_TITLE", 26, 102, statusTitle, stateColor, InpFontSize + 2, "Arial");
   Label("STATUS_NOTE", 26, 126, statusNote, clrWhite, InpFontSize);

   Label("PLAN_HEAD", 20, 154, managing ? "VI THE DANG MO" : "KE HOACH LENH KE TIEP", clrDeepSkyBlue, InpFontSize + 1, "Arial");
   DrawInfoPair("P1", 30, 140, 188, "Diem vao", entry, clrWhite);
   DrawInfoPair("P2", 30, 140, 212, managing ? "Gia hien tai" : "Stoploss", managing ? current : stopLoss, managing ? clrWhite : clrTomato);
   DrawInfoPair("P3", 30, 140, 236, managing ? "Loi gia" : "Khoang SL", distance, clrWhite);
   DrawInfoPair("P4", 30, 140, 260, "Lot", volume, clrAqua);
   DrawInfoPair("P5", 30, 140, 284, managing ? "P/L USD" : "Risk USD", pnl, ProfitColor(pnl));

   DrawInfoPair("Q1", 360, 492, 188, "TP1", tp1, clrLimeGreen);
   DrawInfoPair("Q2", 360, 492, 212, "TP2", tp2, clrLimeGreen);
   DrawInfoPair("Q3", 360, 492, 236, "Huong", side, stateColor);
   DrawInfoPair("Q4", 360, 492, 260, "Setup", Clip(setup, 21), clrWhite);
   DrawInfoPair("Q5", 360, 492, 284, "BE/Partial", bePartial, clrAqua);

   Label("ENTRY_HEAD", 20, 322, "LY DO VAO LENH / CHO LENH", clrDeepSkyBlue, InpFontSize + 1, "Arial");
   Label("ENTRY_1", 30, 356, "- " + entryLine1, clrWhite, InpFontSize);
   Label("ENTRY_2", 30, 378, StringLen(entryLine2) > 0 ? "- " + entryLine2 : " ", clrSilver, InpFontSize);
   Label("ENTRY_3", 30, 400, StringLen(entryLine3) > 0 ? "- " + entryLine3 : " ", clrSilver, InpFontSize);

   Label("HOLD_HEAD", 20, 418, "LY DO GIU / CHO LENH", clrDeepSkyBlue, InpFontSize + 1, "Arial");
   Label("HOLD_1", 30, 450, "- " + holdLine1, managing ? clrWhite : clrSilver, InpFontSize);
   Label("HOLD_2", 30, 472, StringLen(holdLine2) > 0 ? "- " + holdLine2 : " ", clrSilver, InpFontSize);

   Label("SAFETY1", 26, 500, "READ ONLY | DEMO | ORDER PERMISSION = NONE", clrSilver, InpFontSize - 1);
   Label("SAFETY2", 435, 500, "BE +6 | PARTIAL +10 (1/3)", clrSilver, InpFontSize - 1);
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
