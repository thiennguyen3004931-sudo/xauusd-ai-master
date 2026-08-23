#property copyright "XAUUSD AI MASTER"
#property version   "1.32"
#property description "Read-only Phase 7C state-driven compact decision panel"

input string InpApiUrl = "http://127.0.0.1:3711/api/v1/phase7c/decision-monitor/mt5?symbol=XAUUSD";
input int InpRefreshSeconds = 3;
input ENUM_BASE_CORNER InpCorner = CORNER_LEFT_UPPER;
input int InpX = 12;
input int InpY = 28;
input int InpFontSize = 8;

const string PREFIX = "XAU_AI_P7C_";
const int PANEL_WIDTH = 430;
const int PANEL_HEIGHT = 510;
const int INNER_X = 12;
const int INNER_W = 406;
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

void DrawBase()
{
   DeletePanel();
   Rectangle("BG", 0, 0, PANEL_WIDTH, PANEL_HEIGHT, C'4,13,20', C'0,185,220');
   Rectangle("TOP", 8, 6, PANEL_WIDTH - 16, 3, C'0,210,255', C'0,210,255');
}

void DrawHeader(const string modeText, const string regime, const string confidence, const color modeTone)
{
   Rectangle("HEAD", INNER_X, 14, INNER_W, 78, C'8,20,30', C'0,80,110');
   Label("TITLE", 26, 26, "XAUUSD AI MASTER", clrDeepSkyBlue, 12);
   Label("VER", 345, 28, "FINAL v2", clrGold, 8);
   Label("SUB", 26, 50, "Phase 7C | DEMO | READ ONLY", clrSilver, 8);
   Label("MODE", 26, 70, "Mode: " + modeText, modeTone, 8);
   Label("REGIME", 220, 70, "Regime: " + regime + " | Conf: " + confidence + "%", RegimeColor(regime), 8);
}

void DrawReasonCard(const string suffix, const int y, const string title, const string reasonText, const color tone)
{
   Rectangle(suffix + "BOX", INNER_X, y, INNER_W, 110, C'7,21,30', C'0,68,98');
   Label(suffix + "TITLE", 26, y + 12, title, tone, 9);
   string a, b, c;
   ReasonLines3(reasonText, 50, a, b, c);
   Label(suffix + "1", 34, y + 38, "- " + a, clrWhite, 8);
   Label(suffix + "2", 34, y + 58, "- " + b, clrSilver, 8);
   Label(suffix + "3", 34, y + 78, "- " + c, clrSilver, 8);
}

void DrawFooter(const int y)
{
   Rectangle("FOOT", INNER_X, y, INNER_W, 66, C'6,18,26', C'0,68,98');
   Label("FOOT1", 24, y + 12, "READ ONLY | DEMO | ORDER PERMISSION = NONE", clrSilver, 8);
   Label("FOOT2", 24, y + 34, "BE +6 | PARTIAL +10 (1/3) | NEW POSITIONS ONLY", clrSilver, 8);
}

void DrawWaiting(const string payload, const string stage, const string regime)
{
   Rectangle("STATE", INNER_X, 102, INNER_W, 64, C'10,24,34', C'190,120,25');
   Label("STATE_TITLE", 26, 114, "BOT DANG CHO SETUP", clrOrange, 10);
   Label("STATE_LINE", 26, 140, "Stage: " + stage + " | Khong mo lenh moi", clrWhite, 8);

   string reasons = Field(payload, "limitReason") + " | " + Field(payload, "decisionReason") + " | " + Field(payload, "entryReason");
   DrawReasonCard("WAIT", 176, "LY DO CHUA VAO LENH", reasons, clrDeepSkyBlue);

   Rectangle("GATE", INNER_X, 296, INNER_W, 110, C'7,21,30', C'0,68,98');
   Label("GATE_TITLE", 26, 308, "BOT GATE / FILTER", clrAqua, 9);
   string trendGate = (regime == "TREND") ? "Trend gate: regime cho phep xet" : "Trend gate: chua duoc regime cho phep";
   string sd = Field(payload, "hasSupplyDemandRange") == "true" ? "Sideway range: co range hop le" : "Sideway range: chua co range hop le";
   string rev = regime == "REVERSAL" ? "Reversal filter: DANG CHAN LENH MOI" : "Reversal filter: khong chan";
   Label("GATE1", 34, 336, "- " + Clip(trendGate, 50), clrWhite, 8);
   Label("GATE2", 34, 356, "- " + Clip(sd, 50), clrSilver, 8);
   Label("GATE3", 34, 376, "- " + Clip(rev, 50), regime == "REVERSAL" ? clrOrange : clrSilver, 8);

   DrawFooter(416);
}

void DrawTradeBox(const string entry, const string stopLoss, const string tp)
{
   int y = 102;
   int w = 128;
   Rectangle("TRADE", INNER_X, y, INNER_W, 80, C'6,18,27', C'0,70,100');
   Rectangle("ENTRY_BOX", 24, y + 14, w, 52, C'7,25,38', C'0,120,170');
   Rectangle("SL_BOX", 151, y + 14, w, 52, C'30,14,22', C'150,45,60');
   Rectangle("TP_BOX", 278, y + 14, w, 52, C'12,28,20', C'50,150,75');
   Label("ENTRY_LABEL", 42, y + 22, "ENTRY", clrDeepSkyBlue, 8);
   Label("SL_LABEL", 174, y + 22, "STOPLOSS", clrTomato, 8);
   Label("TP_LABEL", 326, y + 22, "TP", clrLimeGreen, 8);
   Label("ENTRY_VALUE", 42, y + 44, Clip(entry, 14), clrWhite, 9);
   Label("SL_VALUE", 174, y + 44, Clip(stopLoss, 14), clrWhite, 9);
   Label("TP_VALUE", 311, y + 44, Clip(tp, 14), clrWhite, 9);
}

void DrawSetup(const string payload)
{
   string entry = CleanValue(Field(payload, "entry"), "-");
   string stopLoss = CleanValue(Field(payload, "stopLoss"), "-");
   string tp = CleanValue(Field(payload, "tp2"), CleanValue(Field(payload, "tp1"), "-"));
   DrawTradeBox(entry, stopLoss, tp);
   string reasons = Field(payload, "entryReason") + " | " + Field(payload, "decisionReason");
   DrawReasonCard("SETUP", 192, "LY DO SETUP DUOC DUYET", reasons, clrLimeGreen);

   Rectangle("RISK", INNER_X, 312, INNER_W, 82, C'7,21,30', C'0,68,98');
   Label("RISK_TITLE", 26, 324, "LOT / RISK", clrAqua, 9);
   Label("RISK1", 34, 350, "- Side: " + CleanValue(Field(payload, "side"), "-"), clrWhite, 8);
   Label("RISK2", 34, 370, "- Lot: " + CleanValue(Field(payload, "finalLot"), "-") + " | Risk%: " + CleanValue(Field(payload, "estimatedRiskPercent"), "-"), clrSilver, 8);
   DrawFooter(404);
}

void DrawManaging(const string payload)
{
   string entry = CleanValue(Field(payload, "positionEntry"), CleanValue(Field(payload, "entry"), "-"));
   string stopLoss = CleanValue(Field(payload, "positionStopLoss"), CleanValue(Field(payload, "stopLoss"), "-"));
   string tp = CleanValue(Field(payload, "positionTp2"), CleanValue(Field(payload, "positionTp1"), CleanValue(Field(payload, "tp2"), CleanValue(Field(payload, "tp1"), "-"))));
   DrawTradeBox(entry, stopLoss, tp);

   Rectangle("PROFIT", INNER_X, 192, INNER_W, 54, C'8,26,20', C'45,130,70');
   Label("PROFIT_TITLE", 26, 204, "DANG GIU LENH", clrLimeGreen, 9);
   Label("PROFIT_LINE", 180, 204, "P/L: " + CleanValue(Field(payload, "floatingPnlUsd"), "-") + " USD", clrWhite, 9);

   DrawReasonCard("HOLD", 256, "LY DO GIU LENH", Field(payload, "holdReason"), clrDeepSkyBlue);

   Rectangle("MANAGE", INNER_X, 376, INNER_W, 58, C'7,21,30', C'0,68,98');
   Label("MANAGE_TITLE", 26, 388, "QUAN TRI LENH", clrAqua, 9);
   Label("MANAGE_LINE", 34, 412, "BE +6 | Partial +10 (1/3)", clrWhite, 8);
   DrawFooter(444);
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

   DrawBase();
   DrawHeader(DisplayMode(activeMode, strategy), regime, confidence, ModeColor(activeMode, strategy));

   if(managing)
      DrawManaging(payload);
   else if(setupReady)
      DrawSetup(payload);
   else
      DrawWaiting(payload, stage, regime);

   ChartRedraw();
}

void RenderError(const string title, const string message)
{
   DeletePanel();
   Rectangle("BG", 0, 0, PANEL_WIDTH, 260, C'4,13,20', C'180,60,60');
   Rectangle("TOP", 8, 6, PANEL_WIDTH - 16, 3, clrTomato, clrTomato);
   Label("TITLE", 26, 28, "XAUUSD AI MASTER", clrDeepSkyBlue, 12);
   Label("VER", 345, 30, "FINAL v2", clrGold, 8);
   Label("ERR", 26, 68, title, clrTomato, 10);
   Label("MSG", 26, 96, Clip(message, 54), clrWhite, 8);
   Label("HELP1", 26, 132, "1. Allow WebRequest: http://127.0.0.1:3711", clrSilver, 8);
   Label("HELP2", 26, 154, "2. Kiem tra Control API/Bridge", clrSilver, 8);
   Label("HELP3", 26, 176, "3. Attach lai EA panel neu can", clrSilver, 8);
   Label("FOOT", 26, 220, "READ ONLY | DEMO | ORDER PERMISSION = NONE", clrSilver, 8);
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
