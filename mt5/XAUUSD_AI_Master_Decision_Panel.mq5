#property copyright "XAUUSD AI MASTER"
#property version   "1.10"
#property description "Read-only Phase 7C position, decision, lot and risk panel EA"

input string InpApiUrl = "http://127.0.0.1:3711/api/v1/phase7c/decision-monitor/mt5?symbol=XAUUSD";
input int InpRefreshSeconds = 3;
input ENUM_BASE_CORNER InpCorner = CORNER_LEFT_UPPER;
input int InpX = 12;
input int InpY = 28;
input int InpFontSize = 9;

const string PREFIX = "XAU_AI_P7C_";
const int PANEL_WIDTH = 690;
const int PANEL_HEIGHT = 520;

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
   ObjectSetString(0, name, OBJPROP_TEXT, text);
}

void WrapTwo(const string value, const int maximum, string &first, string &second)
{
   if(StringLen(value) <= maximum)
   {
      first = value;
      second = "";
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
   first = StringSubstr(value, 0, split);
   second = StringSubstr(value, split + 1);
   if(StringLen(second) > maximum)
      second = StringSubstr(second, 0, maximum - 3) + "...";
}

color StatusColor(const string positionState, const string stage, const string approved)
{
   if(positionState == "MANAGING")
      return clrLimeGreen;
   if(positionState == "UNMANAGED" || stage == "ERROR" || stage == "BLOCKED")
      return clrOrangeRed;
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

void DrawChrome()
{
   Rectangle("BG", 0, 0, PANEL_WIDTH, PANEL_HEIGHT, C'16,20,28', C'62,76,96');
   Rectangle("TOP", 0, 0, PANEL_WIDTH, 5, C'36,184,224', C'36,184,224');
   Rectangle("LEFT", 12, 139, 326, 117, C'23,29,39', C'53,67,86');
   Rectangle("RIGHT", 346, 139, 332, 117, C'23,29,39', C'53,67,86');
   Rectangle("ENTRY_REASON", 12, 288, 666, 72, C'23,29,39', C'53,67,86');
   Rectangle("HOLD_REASON", 12, 370, 666, 72, C'23,29,39', C'53,67,86');
   Rectangle("FOOT", 12, 454, 666, 50, C'19,24,33', C'45,58,75');
}

void RenderError(const string message)
{
   DrawChrome();
   Rectangle("STATUS", 12, 55, 666, 48, C'55,30,30', C'210,70,70');
   Label("TITLE", 16, 13, "XAUUSD AI MASTER", clrDeepSkyBlue, InpFontSize + 3, "Arial");
   Label("SUBTITLE", 16, 36, "PHASE 7C · MT5 DECISION PANEL · READ-ONLY", clrSilver, InpFontSize);
   Label("STATUS_TITLE", 26, 65, "MAT KET NOI API", clrTomato, InpFontSize + 2, "Arial");
   Label("STATUS_NOTE", 26, 88, message, clrWhite);
   Label("ERR_HELP1", 28, 310, "Cho phep WebRequest: http://127.0.0.1:3711", clrGold);
   Label("ERR_HELP2", 28, 336, "Tools > Options > Expert Advisors > Allow WebRequest", clrSilver);
   Label("SAFETY", 26, 466, "ORDER PERMISSION = NONE · Panel khong dat/sua/dong lenh", clrSilver);
   ChartRedraw();
}

void Render(const string payload)
{
   string positionState = Field(payload, "positionState");
   string stage = Field(payload, "stage");
   string approved = Field(payload, "approved");
   color stateColor = StatusColor(positionState, stage, approved);
   bool managing = positionState == "MANAGING" || positionState == "UNMANAGED";

   string entry = managing ? Field(payload, "positionEntry") : Field(payload, "entry");
   string current = managing ? Field(payload, "currentPrice") : "n/a";
   string stopLoss = managing ? Field(payload, "positionStopLoss") : Field(payload, "stopLoss");
   string tp1 = managing ? Field(payload, "positionTp1") : Field(payload, "tp1");
   string tp2 = managing ? Field(payload, "positionTp2") : Field(payload, "tp2");
   string volume = managing ? Field(payload, "positionVolume") : Field(payload, "finalLot");
   string pnl = managing ? Field(payload, "floatingPnlUsd") : "n/a";
   string strategy = managing ? Field(payload, "positionStrategy") : Field(payload, "effectiveStrategy");
   string side = managing ? Field(payload, "positionSide") : Field(payload, "side");
   string setup = managing ? Field(payload, "positionSetup") : Field(payload, "setup");
   string ticket = managing ? Field(payload, "ticket") : "CHUA CO";
   string distance = managing ? Field(payload, "favorableDistance") : Field(payload, "stopDistance");
   string entryLine1, entryLine2, holdLine1, holdLine2;
   WrapTwo(Field(payload, "entryReason"), 94, entryLine1, entryLine2);
   WrapTwo(Field(payload, "holdReason"), 94, holdLine1, holdLine2);

   string statusTitle;
   string statusNote;
   if(positionState == "MANAGING")
   {
      statusTitle = "DANG GIU VI THE " + side + " · " + strategy;
      statusNote = "Ticket " + ticket + " · " + volume + " lot · P/L " + pnl + " USD";
   }
   else if(positionState == "UNMANAGED")
   {
      statusTitle = "CAN KIEM TRA VI THE KHONG THUOC EXECUTOR";
      statusNote = "Ticket " + ticket + " · panel chi doc, khong tu quan ly lenh nay";
   }
   else
   {
      statusTitle = approved == "true" ? "SETUP HOP LE · CHO EXECUTOR" : "DANG CHO SETUP";
      statusNote = "Stage " + stage + " · Mode " + Field(payload, "activeMode") + " → " + strategy;
   }

   DrawChrome();
   Rectangle("STATUS", 12, 55, 666, 48, C'25,38,49', stateColor);
   Label("TITLE", 16, 13, "XAUUSD AI MASTER", clrDeepSkyBlue, InpFontSize + 3, "Arial");
   Label("SUBTITLE", 16, 36, "PHASE 7C · POSITION & DECISION MONITOR", clrSilver, InpFontSize);
   Label("MODE", 478, 17, "MODE " + Field(payload, "activeMode"), clrWhite, InpFontSize + 1);
   Label("REGIME", 478, 37, Field(payload, "regime") + " · CONF " + Field(payload, "confidence"), clrSilver);
   Label("STATUS_TITLE", 26, 64, statusTitle, stateColor, InpFontSize + 2, "Arial");
   Label("STATUS_NOTE", 26, 87, statusNote, clrWhite);

   Label("SECTION", 16, 116, managing ? "VI THE DANG MO" : "KE HOACH LENH KE TIEP", clrDeepSkyBlue, InpFontSize + 1, "Arial");
   Label("L1", 28, 151, "ENTRY", clrSilver);
   Label("L1V", 112, 151, entry, clrWhite, InpFontSize + 1);
   Label("L2", 28, 177, managing ? "PRICE" : "SL DIST", clrSilver);
   Label("L2V", 112, 177, managing ? current : distance, clrWhite, InpFontSize + 1);
   Label("L3", 28, 203, "SL", clrSilver);
   Label("L3V", 112, 203, stopLoss, clrTomato, InpFontSize + 1);
   Label("L4", 28, 229, "LOT", clrSilver);
   Label("L4V", 112, 229, volume, clrAqua, InpFontSize + 1);
   Label("LPNL", 210, 229, "P/L", clrSilver);
   Label("LPNLV", 250, 229, pnl, ProfitColor(pnl), InpFontSize + 1);

   Label("R1", 362, 151, "TP1", clrSilver);
   Label("R1V", 438, 151, tp1, clrLimeGreen, InpFontSize + 1);
   Label("R2", 362, 177, "TP2", clrSilver);
   Label("R2V", 438, 177, tp2, clrLimeGreen, InpFontSize + 1);
   Label("R3", 362, 203, "SETUP", clrSilver);
   Label("R3V", 438, 203, setup, clrWhite);
   Label("R4", 362, 229, "BE / 1/3", clrSilver);
   Label("R4V", 438, 229, Field(payload, "breakEvenApplied") + " / " + Field(payload, "partialApplied"), clrAqua);
   Label("RSIDE", 565, 151, side, stateColor, InpFontSize + 1);
   Label("RDIST", 565, 177, (managing ? "MOVE " : "RISK ") + distance, clrSilver);

   Label("ENTRY_HEAD", 24, 270, "LY DO VAO LENH / CHO LENH", clrDeepSkyBlue, InpFontSize + 1, "Arial");
   Label("ENTRY_1", 26, 302, entryLine1, clrWhite);
   Label("ENTRY_2", 26, 328, entryLine2, clrSilver);
   Label("HOLD_HEAD", 24, 352, "LY DO VAN GIU", clrDeepSkyBlue, InpFontSize + 1, "Arial");
   Label("HOLD_1", 26, 384, holdLine1, managing ? clrWhite : clrSilver);
   Label("HOLD_2", 26, 410, holdLine2, clrSilver);

   Label("SAFETY", 26, 464, "READ-ONLY · ORDER PERMISSION = " + Field(payload, "mt5OrderPermission") + " · DEMO ONLY", clrSilver);
   Label("FOOTMODE", 26, 485, "BE +" + Field(payload, "breakEvenTriggerDistance") + " · PARTIAL " + Field(payload, "partial") + " · UPDATED " + Field(payload, "generatedAt"), clrDimGray);
   ChartRedraw();
}

void RefreshPanel()
{
   char request[];
   char response[];
   string responseHeaders;
   string headers = "Accept: text/plain\r\nCache-Control: no-store\r\n";
   ResetLastError();
   int status = WebRequest("GET", InpApiUrl, headers, 4000, request, response, responseHeaders);
   if(status == -1)
   {
      RenderError("API/WebRequest error " + IntegerToString(GetLastError()));
      return;
   }
   if(status != 200)
   {
      RenderError("Decision API returned HTTP " + IntegerToString(status));
      return;
   }
   string payload = CharArrayToString(response, 0, -1, CP_UTF8);
   if(Field(payload, "version") != "1")
   {
      RenderError("Decision API payload version is invalid");
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
