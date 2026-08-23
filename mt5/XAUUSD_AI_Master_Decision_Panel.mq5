#property copyright "XAUUSD AI MASTER"
#property version   "1.34"
#property description "Read-only Phase 7C state-driven wide dashboard panel v4"

input string InpApiUrl = "http://127.0.0.1:3711/api/v1/phase7c/decision-monitor/mt5?symbol=XAUUSD";
input int InpRefreshSeconds = 3;
input ENUM_BASE_CORNER InpCorner = CORNER_LEFT_UPPER;
input int InpX = 12;
input int InpY = 28;

const string PREFIX = "XAU_AI_P7C_";
const int PANEL_WIDTH = 620;
const int PANEL_HEIGHT_WAITING = 520;
const int PANEL_HEIGHT_SETUP = 520;
const int PANEL_HEIGHT_MANAGING = 570;
const int INNER_X = 14;
const int INNER_W = 592;

const int FONT_TITLE = 16;
const int FONT_VERSION = 9;
const int FONT_META = 10;
const int FONT_STATUS = 12;
const int FONT_SECTION = 11;
const int FONT_BODY = 10;
const int FONT_VALUE = 11;
const int FONT_FOOTER = 9;

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

bool EmptyValue(const string value)
{
   return value == "" || value == "n/a" || value == "N/A" || value == "null" || value == "undefined" || value == "-";
}

string CleanValue(const string value, const string fallback)
{
   if(EmptyValue(value))
      return fallback;
   return value;
}

bool UsableValue(const string value)
{
   return !EmptyValue(value);
}

string Clip(const string value, const int maximum)
{
   if(maximum <= 3 || StringLen(value) <= maximum)
      return value;
   return StringSubstr(value, 0, maximum - 3) + "...";
}

string CompactText(const string value)
{
   string text = value;
   StringReplace(text, "PAUSE chặn mọi lệnh mới; không thay đổi vị thế đang được quản lý.", "PAUSE chan lenh moi; khong doi vi the dang quan ly.");
   StringReplace(text, "A confirmed CHOCH indicates a possible structural reversal.", "CHOCH xac nhan kha nang dao chieu cau truc.");
   StringReplace(text, "Bollinger bandwidth is", "Bollinger bandwidth:");
   StringReplace(text, "No valid setup", "Chua co setup hop le");
   StringReplace(text, "panel does not have order permission", "panel chi doc, khong gui lenh");
   StringReplace(text, "panel không có quyền gửi lệnh", "panel chi doc, khong gui lenh");
   StringReplace(text, "Chờ setup hợp lệ", "Cho setup hop le");
   StringReplace(text, " · ", "\n");
   StringReplace(text, " | ", "\n");
   StringReplace(text, "; ", "\n");
   StringReplace(text, " • ", "\n");
   return text;
}

void ReasonLines3(const string value, const int maximum, string &line1, string &line2, string &line3)
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
      if(StringLen(part) == 0 || EmptyValue(part))
         continue;
      if(written == 0)
         line1 = Clip(part, maximum);
      else if(written == 1)
         line2 = Clip(part, maximum);
      else
         line3 = Clip(part, maximum);
      written++;
   }

   if(written == 0)
      line1 = "Chua co ly do tu engine";
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
   ObjectSetString(0, name, OBJPROP_FONT, "Segoe UI");
   ObjectSetString(0, name, OBJPROP_TEXT, StringLen(text) > 0 ? text : " ");
}

color ModeColor(const string activeMode, const string strategy)
{
   if(activeMode == "PAUSE" || strategy == "PAUSE")
      return clrOrange;
   if(activeMode == "AUTO")
      return clrLimeGreen;
   if(activeMode == "TREND")
      return clrDeepSkyBlue;
   if(activeMode == "SIDEWAY")
      return clrAqua;
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

string DisplayMode(const string activeMode, const string strategy)
{
   if(activeMode != strategy && strategy != "Chua co")
      return activeMode + " -> " + strategy;
   return activeMode;
}

void DrawBase(const int panelHeight)
{
   DeletePanel();
   Rectangle("BG", 0, 0, PANEL_WIDTH, panelHeight, C'4,13,20', C'0,185,220');
   Rectangle("TOP", 8, 6, PANEL_WIDTH - 16, 3, C'0,210,255', C'0,210,255');
}

void DrawHeader(const string modeText, const string regime, const string confidence, const color modeTone)
{
   Rectangle("HEAD", INNER_X, 14, INNER_W, 104, C'8,20,30', C'0,80,110');
   Label("TITLE", 30, 24, "XAUUSD AI MASTER", clrDeepSkyBlue, FONT_TITLE);
   Label("VER", 526, 28, "FINAL v4", clrGold, FONT_VERSION);
   Label("SUB", 30, 52, "Phase 7C | DEMO | READ ONLY", clrSilver, FONT_META);
   Label("MODE", 30, 75, "Mode: " + Clip(modeText, 48), modeTone, FONT_META);
   Label("REGIME", 30, 96, "Regime: " + regime, RegimeColor(regime), FONT_META);
   Label("CONF", 390, 96, "Confidence: " + confidence + "%", RegimeColor(regime), FONT_META);
}

void DrawReasonCard(const string suffix, const int y, const string title, const string reasonText, const color tone)
{
   Rectangle(suffix + "BOX", INNER_X, y, INNER_W, 112, C'7,21,30', C'0,68,98');
   Label(suffix + "TITLE", 30, y + 12, title, tone, FONT_SECTION);
   string a, b, c;
   ReasonLines3(reasonText, 58, a, b, c);
   Label(suffix + "1", 42, y + 42, "- " + Clip(a, 58), clrWhite, FONT_BODY);
   Label(suffix + "2", 42, y + 64, "- " + Clip(b, 58), clrSilver, FONT_BODY);
   Label(suffix + "3", 42, y + 86, "- " + Clip(c, 58), clrSilver, FONT_BODY);
}

void DrawFooter(const int y)
{
   Rectangle("FOOT", INNER_X, y, INNER_W, 58, C'6,18,26', C'0,68,98');
   Label("FOOT1", 30, y + 8, "READ ONLY | DEMO | ORDER NONE", clrSilver, FONT_FOOTER);
   Label("FOOT2", 30, y + 28, "BE +6 | PARTIAL +10 (1/3)", clrSilver, FONT_FOOTER);
   Label("FOOT3", 390, y + 28, "NEW POSITIONS ONLY", clrSilver, FONT_FOOTER);
}

void DrawWaiting(const string payload, const string stage, const string regime)
{
   Rectangle("STATE", INNER_X, 126, INNER_W, 64, C'10,24,34', C'190,120,25');
   Label("STATE_TITLE", 30, 138, "BOT DANG CHO SETUP", clrOrange, FONT_STATUS);
   Label("STATE_STAGE", 30, 164, "Stage: " + stage, clrWhite, FONT_BODY);
   Label("STATE_ACTION", 250, 164, "Hanh dong: Khong mo lenh moi", clrSilver, FONT_BODY);

   string reasons = Field(payload, "limitReason") + " | " + Field(payload, "decisionReason") + " | " + Field(payload, "entryReason");
   DrawReasonCard("WAIT", 198, "LY DO CHUA VAO LENH", reasons, clrDeepSkyBlue);

   Rectangle("GATE", INNER_X, 318, INNER_W, 124, C'7,21,30', C'0,68,98');
   Label("GATE_TITLE", 30, 330, "BOT GATE / FILTER", clrAqua, FONT_SECTION);

   string trendGate = (regime == "TREND") ? "Trend gate: DUOC XET" : "Trend gate: CHUA CHO PHEP";
   string sidewayGate = Field(payload, "hasSupplyDemandRange") == "true" ? "Sideway range: CO RANGE" : "Sideway range: CHUA CO RANGE";
   string reversalGate = regime == "REVERSAL" ? "Reversal filter: DANG CHAN" : "Reversal filter: KHONG CHAN";
   string recommended = "Recommended: " + CleanValue(Field(payload, "recommendedMode"), "-");

   Label("GATE1", 42, 358, "- " + Clip(trendGate, 60), clrWhite, FONT_BODY);
   Label("GATE2", 42, 380, "- " + Clip(sidewayGate, 60), clrSilver, FONT_BODY);
   Label("GATE3", 42, 402, "- " + Clip(reversalGate, 60), regime == "REVERSAL" ? clrOrange : clrSilver, FONT_BODY);
   Label("GATE4", 42, 424, "- " + Clip(recommended, 60), clrSilver, FONT_BODY);

   DrawFooter(450);
}

void DrawTradeBox(const string entry, const string stopLoss, const string tp)
{
   int y = 126;
   int w = 178;
   Rectangle("TRADE", INNER_X, y, INNER_W, 90, C'6,18,27', C'0,70,100');
   Rectangle("ENTRY_BOX", 26, y + 14, w, 62, C'7,25,38', C'0,120,170');
   Rectangle("SL_BOX", 221, y + 14, w, 62, C'30,14,22', C'150,45,60');
   Rectangle("TP_BOX", 416, y + 14, w, 62, C'12,28,20', C'50,150,75');

   Label("ENTRY_LABEL", 42, y + 22, "ENTRY", clrDeepSkyBlue, FONT_META);
   Label("SL_LABEL", 242, y + 22, "STOPLOSS", clrTomato, FONT_META);
   Label("TP_LABEL", 482, y + 22, "TP", clrLimeGreen, FONT_META);
   Label("ENTRY_VALUE", 42, y + 47, Clip(entry, 18), clrWhite, FONT_VALUE);
   Label("SL_VALUE", 242, y + 47, Clip(stopLoss, 18), clrWhite, FONT_VALUE);
   Label("TP_VALUE", 452, y + 47, Clip(tp, 18), clrWhite, FONT_VALUE);
}

void DrawSetup(const string payload)
{
   string entry = CleanValue(Field(payload, "entry"), "-");
   string stopLoss = CleanValue(Field(payload, "stopLoss"), "-");
   string tp = CleanValue(Field(payload, "tp2"), CleanValue(Field(payload, "tp1"), "-"));

   DrawTradeBox(entry, stopLoss, tp);

   string reasons = Field(payload, "entryReason") + " | " + Field(payload, "decisionReason") + " | " + Field(payload, "engineReasons");
   DrawReasonCard("SETUP", 224, "LY DO SETUP DUOC DUYET", reasons, clrLimeGreen);

   Rectangle("RISK", INNER_X, 344, INNER_W, 92, C'7,21,30', C'0,68,98');
   Label("RISK_TITLE", 30, 356, "LOT / RISK", clrAqua, FONT_SECTION);
   Label("RISK1", 42, 386, "Side: " + CleanValue(Field(payload, "side"), "-"), clrWhite, FONT_BODY);
   Label("RISK2", 250, 386, "Lot: " + CleanValue(Field(payload, "finalLot"), "-"), clrWhite, FONT_BODY);
   Label("RISK3", 42, 410, "Risk: " + CleanValue(Field(payload, "estimatedRiskPercent"), "-") + "%", clrSilver, FONT_BODY);
   Label("RISK4", 250, 410, "SL distance: " + CleanValue(Field(payload, "stopDistance"), "-"), clrSilver, FONT_BODY);

   DrawFooter(444);
}

void DrawManaging(const string payload)
{
   string entry = CleanValue(Field(payload, "positionEntry"), CleanValue(Field(payload, "entry"), "-"));
   string stopLoss = CleanValue(Field(payload, "positionStopLoss"), CleanValue(Field(payload, "stopLoss"), "-"));
   string tp = CleanValue(Field(payload, "positionTp2"), CleanValue(Field(payload, "positionTp1"), CleanValue(Field(payload, "tp2"), CleanValue(Field(payload, "tp1"), "-"))));

   DrawTradeBox(entry, stopLoss, tp);

   Rectangle("PROFIT", INNER_X, 224, INNER_W, 66, C'8,26,20', C'45,130,70');
   Label("PROFIT_TITLE", 30, 238, "DANG GIU LENH", clrLimeGreen, FONT_SECTION);
   Label("PROFIT_SIDE", 220, 238, CleanValue(Field(payload, "positionSide"), CleanValue(Field(payload, "side"), "-")), clrWhite, FONT_BODY);
   Label("PROFIT_LINE", 30, 264, "Floating P/L: " + CleanValue(Field(payload, "floatingPnlUsd"), "-") + " USD", clrWhite, FONT_STATUS);

   DrawReasonCard("HOLD", 298, "LY DO GIU LENH", Field(payload, "holdReason"), clrDeepSkyBlue);

   Rectangle("MANAGE", INNER_X, 418, INNER_W, 74, C'7,21,30', C'0,68,98');
   Label("MANAGE_TITLE", 30, 430, "QUAN TRI LENH", clrAqua, FONT_SECTION);
   Label("MANAGE1", 42, 458, "BE trigger: +6", clrWhite, FONT_BODY);
   Label("MANAGE2", 250, 458, "Partial: +10 -> dong 1/3", clrWhite, FONT_BODY);

   DrawFooter(500);
}

void RenderPanel(const string payload)
{
   string activeMode = CleanValue(Field(payload, "activeMode"), "Chua co");
   string strategy = CleanValue(Field(payload, "effectiveStrategy"), activeMode);
   string regime = CleanValue(Field(payload, "regime"), "Chua co");
   string confidence = CleanValue(Field(payload, "confidence"), "-");
   string stage = CleanValue(Field(payload, "stage"), "Chua co");
   string approved = Field(payload, "approved");
   string positionState = Field(payload, "positionState");
   int positionCount = (int)StringToInteger(CleanValue(Field(payload, "positionCount"), "0"));

   bool managing = positionCount > 0 || positionState == "MANAGING" || positionState == "UNMANAGED";
   bool setupReady = !managing && approved == "true" && UsableValue(Field(payload, "entry")) && UsableValue(Field(payload, "stopLoss"));

   if(managing)
   {
      DrawBase(PANEL_HEIGHT_MANAGING);
      DrawHeader(DisplayMode(activeMode, strategy), regime, confidence, ModeColor(activeMode, strategy));
      DrawManaging(payload);
   }
   else if(setupReady)
   {
      DrawBase(PANEL_HEIGHT_SETUP);
      DrawHeader(DisplayMode(activeMode, strategy), regime, confidence, ModeColor(activeMode, strategy));
      DrawSetup(payload);
   }
   else
   {
      DrawBase(PANEL_HEIGHT_WAITING);
      DrawHeader(DisplayMode(activeMode, strategy), regime, confidence, ModeColor(activeMode, strategy));
      DrawWaiting(payload, stage, regime);
   }

   ChartRedraw();
}

void RenderError(const string title, const string message)
{
   DeletePanel();
   Rectangle("BG", 0, 0, PANEL_WIDTH, 320, C'4,13,20', C'180,60,60');
   Rectangle("TOP", 8, 6, PANEL_WIDTH - 16, 3, clrTomato, clrTomato);
   Label("TITLE", 30, 24, "XAUUSD AI MASTER", clrDeepSkyBlue, FONT_TITLE);
   Label("VER", 526, 28, "FINAL v4", clrGold, FONT_VERSION);
   Label("ERR", 30, 70, title, clrTomato, FONT_STATUS);
   Label("MSG", 30, 102, Clip(message, 70), clrWhite, FONT_BODY);
   Label("HELP1", 30, 146, "1. Allow WebRequest: http://127.0.0.1:3711", clrSilver, FONT_BODY);
   Label("HELP2", 30, 172, "2. Kiem tra Control API / MT5 Bridge", clrSilver, FONT_BODY);
   Label("HELP3", 30, 198, "3. Attach lai EA panel neu can", clrSilver, FONT_BODY);
   Label("FOOT", 30, 270, "READ ONLY | DEMO | ORDER PERMISSION = NONE", clrSilver, FONT_FOOTER);
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
      RenderError("KHONG GOI DUOC CONTROL API", "WebRequest error " + IntegerToString(GetLastError()));
      return;
   }

   if(status != 200)
   {
      RenderError("CONTROL API CHUA SAN SANG", "HTTP " + IntegerToString(status));
      return;
   }

   string payload = CharArrayToString(response, 0, -1, CP_UTF8);
   if(Field(payload, "version") != "1")
   {
      RenderError("DU LIEU PANEL KHONG HOP LE", "Decision monitor payload invalid");
      return;
   }

   RenderPanel(payload);
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
