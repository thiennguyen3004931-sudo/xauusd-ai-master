#property copyright "XAUUSD AI MASTER"
#property version   "1.00"
#property description "Read-only Phase 7C decision, lot and risk chart panel EA"

input string InpApiUrl = "http://127.0.0.1:3711/api/v1/phase7c/decision-monitor/mt5?symbol=XAUUSD";
input int InpRefreshSeconds = 5;
input ENUM_BASE_CORNER InpCorner = CORNER_LEFT_UPPER;
input int InpX = 12;
input int InpY = 28;
input int InpFontSize = 9;

const string PREFIX = "XAU_AI_P7C_";
const int PANEL_WIDTH = 465;
const int PANEL_HEIGHT = 382;
const int LINE_HEIGHT = 20;

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

void CreateBackground()
{
   string name = PREFIX + "BG";
   if(ObjectFind(0, name) >= 0)
      return;
   ObjectCreate(0, name, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, name, OBJPROP_CORNER, InpCorner);
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, InpX);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, InpY);
   ObjectSetInteger(0, name, OBJPROP_XSIZE, PANEL_WIDTH);
   ObjectSetInteger(0, name, OBJPROP_YSIZE, PANEL_HEIGHT);
   ObjectSetInteger(0, name, OBJPROP_BGCOLOR, C'20,24,32');
   ObjectSetInteger(0, name, OBJPROP_BORDER_COLOR, C'70,82,100');
   ObjectSetInteger(0, name, OBJPROP_BACK, false);
   ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
}

void SetLine(const int line, const string text, const color textColor = clrWhite, const int fontSize = 0)
{
   string name = PREFIX + "L" + IntegerToString(line);
   if(ObjectFind(0, name) < 0)
   {
      ObjectCreate(0, name, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, name, OBJPROP_CORNER, InpCorner);
      ObjectSetInteger(0, name, OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
      ObjectSetInteger(0, name, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, name, OBJPROP_HIDDEN, true);
      ObjectSetString(0, name, OBJPROP_FONT, "Consolas");
   }
   ObjectSetInteger(0, name, OBJPROP_XDISTANCE, InpX + 12);
   ObjectSetInteger(0, name, OBJPROP_YDISTANCE, InpY + 10 + line * LINE_HEIGHT);
   ObjectSetInteger(0, name, OBJPROP_COLOR, textColor);
   ObjectSetInteger(0, name, OBJPROP_FONTSIZE, fontSize > 0 ? fontSize : InpFontSize);
   ObjectSetString(0, name, OBJPROP_TEXT, text);
}

string Pair(const string left, const string right)
{
   return left + "  |  " + right;
}

string Clip(const string value, const int maximum = 72)
{
   if(StringLen(value) <= maximum)
      return value;
   return StringSubstr(value, 0, maximum - 3) + "...";
}

color StageColor(const string stage, const string approved)
{
   if(approved == "true")
      return clrLimeGreen;
   if(stage == "ERROR" || stage == "BLOCKED")
      return clrOrangeRed;
   if(stage == "SUBMITTED" || stage == "FILLED" || stage == "MANAGING")
      return clrDeepSkyBlue;
   return clrGold;
}

void RenderError(const string message)
{
   CreateBackground();
   SetLine(0, "XAUUSD AI MASTER · PHASE 7C", clrDeepSkyBlue, InpFontSize + 1);
   SetLine(1, "MT5 PANEL: READ-ONLY · ORDER PERMISSION = NONE", clrSilver);
   SetLine(3, message, clrOrangeRed);
   SetLine(5, "Allow WebRequest URL: http://127.0.0.1:3711", clrGold);
   SetLine(6, "Tools > Options > Expert Advisors > Allow WebRequest", clrSilver);
   ChartRedraw();
}

void Render(const string payload)
{
   string stage = Field(payload, "stage");
   string approved = Field(payload, "approved");
   color statusColor = StageColor(stage, approved);
   string decision = approved == "true" ? "SETUP HOP LE" : "CHUA GUI LENH";

   CreateBackground();
   SetLine(0, "XAUUSD AI MASTER · PHASE 7C", clrDeepSkyBlue, InpFontSize + 1);
   SetLine(1, "MT5 PANEL: READ-ONLY · ORDER PERMISSION = " + Field(payload, "mt5OrderPermission"), clrSilver);
   SetLine(2, Pair("MODE " + Field(payload, "activeMode"), "EFFECTIVE " + Field(payload, "effectiveStrategy")), clrWhite);
   SetLine(3, Pair("REGIME " + Field(payload, "regime"), "CONF " + Field(payload, "confidence")), clrWhite);
   SetLine(4, Pair("STAGE " + stage, decision), statusColor);
   SetLine(5, Pair("SIDE " + Field(payload, "side"), "SETUP " + Field(payload, "setup")), clrWhite);
   SetLine(6, Pair("ENTRY " + Field(payload, "entry"), "SL " + Field(payload, "stopLoss")), clrWhite);
   SetLine(7, Pair("SL DIST " + Field(payload, "stopDistance"), "BE +" + Field(payload, "breakEvenTriggerDistance")), clrWhite);
   SetLine(8, Pair("LOT RAW " + Field(payload, "rawLot"), "FINAL " + Field(payload, "finalLot")), clrAqua);
   SetLine(9, Pair("LOT CAP " + Field(payload, "lotCap"), "RISK TARGET " + Field(payload, "riskTargetPercent") + "%"), clrAqua);
   SetLine(10, Pair("RISK USD " + Field(payload, "estimatedRiskUsd"), "RISK % " + Field(payload, "estimatedRiskPercent")), clrAqua);
   SetLine(11, Pair("TP1 " + Field(payload, "tp1"), "TP2 " + Field(payload, "tp2")), clrWhite);
   SetLine(12, "PARTIAL " + Field(payload, "partial"), clrWhite);
   SetLine(13, "LIMIT: " + Clip(Field(payload, "limitReason")), clrGold);
   SetLine(14, "DECISION: " + Clip(Field(payload, "decisionReason")), statusColor);
   SetLine(15, "ENGINE: " + Clip(Field(payload, "engineReasons")), clrSilver);
   SetLine(16, "UPDATED(ms): " + Field(payload, "generatedAt"), clrDimGray);
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
   CreateBackground();
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
