#property copyright "XAUUSD AI MASTER"
#property version   "1.20"
#property description "Read-only Phase 7C synchronized position and decision panel"

input string InpApiUrl = "http://127.0.0.1:3711/api/v1/phase7c/decision-monitor/mt5?symbol=XAUUSD";
input int InpRefreshSeconds = 3;
input ENUM_BASE_CORNER InpCorner = CORNER_LEFT_UPPER;
input int InpX = 12;
input int InpY = 28;
input int InpFontSize = 10;

const string PREFIX = "XAU_AI_P7C_";
const int PANEL_WIDTH = 700;
const int PANEL_HEIGHT = 568;
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
   string remaining;
   TakeWrappedLine(value, maximum, first, remaining);
   TakeWrappedLine(remaining, maximum, second, third);
   if(StringLen(third) > maximum)
      third = StringSubstr(third, 0, maximum - 3) + "...";
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

void BeginLayout(const bool errorMode)
{
   if(g_error_mode != errorMode)
      DeletePanel();
   g_error_mode = errorMode;
   Rectangle("BG", 0, 0, PANEL_WIDTH, errorMode ? 372 : PANEL_HEIGHT, C'14,18,25', C'71,86,106');
   Rectangle("TOP", 0, 0, PANEL_WIDTH, 5, C'36,184,224', C'36,184,224');
}

void DrawNormalChrome()
{
   BeginLayout(false);
   Rectangle("STATUS", 12, 58, 676, 55, C'24,33,43', C'58,73,92');
   Rectangle("LEFT", 12, 148, 328, 148, C'22,27,36', C'50,63,80');
   Rectangle("RIGHT", 348, 148, 340, 148, C'22,27,36', C'50,63,80');
   Rectangle("ENTRY_REASON", 12, 330, 676, 82, C'22,27,36', C'50,63,80');
   Rectangle("HOLD_REASON", 12, 446, 676, 82, C'22,27,36', C'50,63,80');
   Rectangle("FOOT", 12, 538, 676, 20, C'18,23,31', C'42,54,69');
}

void RenderError(const string title, const string message, const bool showWebRequestHelp)
{
   BeginLayout(true);
   Rectangle("STATUS", 12, 58, 676, 64, C'55,30,30', C'210,70,70');
   Rectangle("RECOVERY", 12, 138, 676, 164, C'22,27,36', C'50,63,80');
   Rectangle("FOOT", 12, 318, 676, 42, C'18,23,31', C'42,54,69');

   Label("TITLE", 18, 15, "XAUUSD AI MASTER", clrDeepSkyBlue, InpFontSize + 4, "Arial");
   Label("SUBTITLE", 18, 39, "PHASE 7C | READ-ONLY | SYNCHRONIZED", clrSilver);
   Label("STATUS_TITLE", 26, 70, title, clrTomato, InpFontSize + 2, "Arial");
   Label("STATUS_NOTE", 26, 96, message, clrWhite);

   Label("RECOVERY_HEAD", 26, 153, "TU DONG PHUC HOI KET NOI", clrDeepSkyBlue, InpFontSize + 1, "Arial");
   if(showWebRequestHelp)
   {
      Label("HELP1", 28, 187, "1. Tools > Options > Expert Advisors", clrWhite);
      Label("HELP2", 28, 215, "2. Allow WebRequest: http://127.0.0.1:3711", clrGold);
      Label("HELP3", 28, 243, "3. Mo lai Control Center neu API chua chay", clrSilver);
   }
   else
   {
      Label("HELP1", 28, 187, "Bridge dang khoi tao lai phien MetaTrader5 IPC.", clrWhite);
      Label("HELP2", 28, 215, "Giu MT5 mo, dung tai khoan DEMO va cho gia cap nhat.", clrGold);
      Label("HELP3", 28, 243, "Panel tu dong tai lai moi " + IntegerToString(InpRefreshSeconds) + " giay.", clrSilver);
   }
   Label("HELP4", 28, 271, "Khong bam gui lenh; panel khong co quyen giao dich.", clrSilver);
   Label("SAFETY", 26, 330, "READ ONLY | DEMO ONLY | ORDER PERMISSION = NONE", clrSilver);
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
   string pnl = managing ? Field(payload, "floatingPnlUsd") : Field(payload, "estimatedRiskUsd");
   string strategy = managing ? Field(payload, "positionStrategy") : Field(payload, "effectiveStrategy");
   string side = managing ? Field(payload, "positionSide") : Field(payload, "side");
   string setup = managing ? Field(payload, "positionSetup") : Field(payload, "setup");
   string ticket = managing ? Field(payload, "ticket") : "n/a";
   string distance = managing ? Field(payload, "favorableDistance") : Field(payload, "stopDistance");
   string entryLine1, entryLine2, entryLine3, holdLine1, holdLine2, holdLine3;
   WrapThree(Field(payload, "entryReason"), 62, entryLine1, entryLine2, entryLine3);
   WrapThree(Field(payload, "holdReason"), 62, holdLine1, holdLine2, holdLine3);

   string statusTitle;
   string statusNote;
   if(positionState == "MANAGING")
   {
      statusTitle = "DANG GIU VI THE " + side + " | " + strategy;
      statusNote = "Ticket " + ticket + " | " + volume + " lot | P/L " + pnl + " USD";
   }
   else if(positionState == "UNMANAGED")
   {
      statusTitle = "CAN KIEM TRA VI THE KHONG THUOC EXECUTOR";
      statusNote = "Ticket " + ticket + " | panel chi doc, khong tu quan ly";
   }
   else
   {
      statusTitle = approved == "true" ? "SETUP HOP LE | CHO EXECUTOR" : "DANG CHO SETUP";
      statusNote = "Stage " + stage + " | Mode " + Field(payload, "activeMode") + " -> " + strategy;
   }

   DrawNormalChrome();
   Rectangle("STATUS", 12, 58, 676, 55, C'24,33,43', stateColor);
   Label("TITLE", 18, 15, "XAUUSD AI MASTER", clrDeepSkyBlue, InpFontSize + 4, "Arial");
   Label("SUBTITLE", 18, 39, "PHASE 7C | POSITION & DECISION MONITOR", clrSilver);
   Label("MODE", 500, 16, "MODE " + Field(payload, "activeMode"), clrWhite, InpFontSize + 1);
   Label("REGIME", 500, 39, Field(payload, "regime") + " | CONF " + Field(payload, "confidence"), clrSilver);
   Label("STATUS_TITLE", 26, 70, statusTitle, stateColor, InpFontSize + 2, "Arial");
   Label("STATUS_NOTE", 26, 94, statusNote, clrWhite);

   Label("SECTION", 18, 124, managing ? "VI THE DANG MO" : "KE HOACH LENH KE TIEP", clrDeepSkyBlue, InpFontSize + 1, "Arial");

   Label("L1", 28, 159, "ENTRY", clrSilver);
   Label("L1V", 128, 159, entry, clrWhite, InpFontSize + 1);
   Label("L2", 28, 186, managing ? "CURRENT" : "SL DIST", clrSilver);
   Label("L2V", 128, 186, managing ? current : distance, clrWhite, InpFontSize + 1);
   Label("L3", 28, 213, "STOP LOSS", clrSilver);
   Label("L3V", 128, 213, stopLoss, clrTomato, InpFontSize + 1);
   Label("L4", 28, 240, "LOT", clrSilver);
   Label("L4V", 128, 240, volume, clrAqua, InpFontSize + 1);
   Label("L5", 28, 267, managing ? "P/L USD" : "RISK USD", clrSilver);
   Label("L5V", 128, 267, pnl, ProfitColor(pnl), InpFontSize + 1);

   Label("R1", 364, 159, "TP1", clrSilver);
   Label("R1V", 472, 159, tp1, clrLimeGreen, InpFontSize + 1);
   Label("R2", 364, 186, "TP2", clrSilver);
   Label("R2V", 472, 186, tp2, clrLimeGreen, InpFontSize + 1);
   Label("R3", 364, 213, "SIDE", clrSilver);
   Label("R3V", 472, 213, side, stateColor, InpFontSize + 1);
   Label("R4", 364, 240, "SETUP", clrSilver);
   Label("R4V", 472, 240, setup, clrWhite);
   Label("R5", 364, 267, "BE / PARTIAL", clrSilver);
   Label("R5V", 472, 267, Field(payload, "breakEvenApplied") + " / " + Field(payload, "partialApplied"), clrAqua);

   Label("ENTRY_HEAD", 20, 307, "LY DO VAO LENH / CHO LENH", clrDeepSkyBlue, InpFontSize + 1, "Arial");
   Label("ENTRY_1", 28, 342, entryLine1, clrWhite);
   Label("ENTRY_2", 28, 365, entryLine2, clrSilver);
   Label("ENTRY_3", 28, 388, entryLine3, clrSilver);

   Label("HOLD_HEAD", 20, 423, "LY DO VAN GIU", clrDeepSkyBlue, InpFontSize + 1, "Arial");
   Label("HOLD_1", 28, 458, holdLine1, managing ? clrWhite : clrSilver);
   Label("HOLD_2", 28, 481, holdLine2, clrSilver);
   Label("HOLD_3", 28, 504, holdLine3, clrSilver);

   Label("SAFETY", 26, 540, "READ ONLY | DEMO | ORDER NONE | BE +6 | PARTIAL 1/3@+10", clrSilver);
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
         RenderError("CONTROL API TAM THOI CHUA SAN SANG", "Decision API returned HTTP " + IntegerToString(status), false);
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
