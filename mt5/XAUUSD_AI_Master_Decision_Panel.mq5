#property copyright "XAUUSD AI MASTER"
#property version   "1.31"
#property description "Read-only Phase 7C final compact dashboard panel"

input string InpApiUrl = "http://127.0.0.1:3711/api/v1/phase7c/decision-monitor/mt5?symbol=XAUUSD";
input int InpRefreshSeconds = 3;
input ENUM_BASE_CORNER InpCorner = CORNER_LEFT_UPPER;
input int InpX = 12;
input int InpY = 28;
input int InpFontSize = 8;

const string PREFIX = "XAU_AI_P7C_";
const int PANEL_WIDTH = 430;
const int PANEL_HEIGHT = 690;
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
   return value == "" || value == "n/a" || value == "N/A" || value == "null" || value == "undefined";
}

string CleanValue(const string value, const string fallback)
{
   if(EmptyValue(value))
      return fallback;
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
   StringReplace(text, "panel không có quyền gửi lệnh", "panel chi doc, khong gui lenh");
   StringReplace(text, "Chờ setup hợp lệ", "Cho setup hop le");
   StringReplace(text, " · ", "\n");
   StringReplace(text, " | ", "\n");
   StringReplace(text, "; ", "\n");
   StringReplace(text, " • ", "\n");
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

void ReasonLines(const string value, const int maximum, string &line1, string &line2, string &line3, string &line4)
{
   string compact = CompactText(value);
   string parts[];
   ushort separator = (ushort)StringGetCharacter("\n", 0);
   int count = StringSplit(compact, separator, parts);
   line1 = "";
   line2 = "";
   line3 = "";
   line4 = "";

   int written = 0;
   for(int i = 0; i < count && written < 4; i++)
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
      else if(written == 2)
         line3 = Clip(part, maximum);
      else
         line4 = Clip(part, maximum);
      written++;
   }

   if(written > 0)
      return;

   string rest1, rest2;
   TakeLine(compact, maximum, line1, rest1);
   TakeLine(rest1, maximum, line2, rest2);
   TakeLine(rest2, maximum, line3, line4);
   line4 = Clip(line4, maximum);
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

void Label(const string suffix, const int x, const int y, const string text, const color textColor, const int fontSize, const string font)
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
   ObjectSetString(0, name, OBJPROP_FONT, font);
   ObjectSetString(0, name, OBJPROP_TEXT, StringLen(text) > 0 ? text : " ");
}

color ModeColor(const string activeMode, const string effectiveStrategy)
{
   if(effectiveStrategy == "PAUSE" || activeMode == "PAUSE")
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

color StageColor(const string stage, const string approved, const string positionState)
{
   if(positionState == "MANAGING")
      return clrLimeGreen;
   if(stage == "BLOCKED")
      return clrOrange;
   if(approved == "true")
      return clrLimeGreen;
   return clrGold;
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

void DrawHeader(const string modeText, const string regime, const string confidence, const color modeColor)
{
   Rectangle("HEAD", INNER_X, 14, INNER_W, 78, C'8,20,30', C'0,80,110');
   Label("TITLE", 30, 28, "XAUUSD AI MASTER", clrDeepSkyBlue, 14, "Segoe UI");
   Label("VER", 342, 30, "vFinal", clrGold, 8, "Segoe UI");
   Label("SUB", 30, 52, "Phase 7C | DEMO | READ ONLY", clrSilver, 8, "Segoe UI");
   Label("MODE", 30, 73, "Mode bot: " + modeText, modeColor, 9, "Segoe UI");
   Label("REGIME", 230, 73, "Regime: " + regime + " | Conf: " + confidence, RegimeColor(regime), 8, "Segoe UI");
}

void DrawTradeBox(const string entry, const string stopLoss, const string tp)
{
   int y = 104;
   int w = 128;
   Rectangle("TRADE", INNER_X, y, INNER_W, 76, C'6,18,27', C'0,70,100');
   Rectangle("ENTRY_BOX", 24, y + 14, w, 50, C'7,25,38', C'0,120,170');
   Rectangle("SL_BOX", 151, y + 14, w, 50, C'30,14,22', C'150,45,60');
   Rectangle("TP_BOX", 278, y + 14, w, 50, C'12,28,20', C'50,150,75');

   Label("ENTRY_LABEL", 42, y + 23, "ENTRY", clrDeepSkyBlue, 8, "Segoe UI");
   Label("SL_LABEL", 174, y + 23, "STOPLOSS", clrTomato, 8, "Segoe UI");
   Label("TP_LABEL", 326, y + 23, "TP", clrLimeGreen, 8, "Segoe UI");
   Label("ENTRY_VALUE", 42, y + 45, Clip(entry, 14), clrWhite, 11, "Segoe UI");
   Label("SL_VALUE", 174, y + 45, Clip(stopLoss, 14), clrWhite, 11, "Segoe UI");
   Label("TP_VALUE", 311, y + 45, Clip(tp, 14), clrWhite, 11, "Segoe UI");
}

void DrawStateCard(const string title, const string line1, const string line2, const color tone)
{
   int y = 194;
   Rectangle("STATE", INNER_X, y, INNER_W, 72, C'9,24,35', tone);
   Label("STATE_TITLE", 24, y + 12, title, tone, 13, "Segoe UI");
   Label("STATE_L1", 26, y + 40, Clip(line1, 48), clrWhite, 8, "Segoe UI");
   Label("STATE_L2", 26, y + 56, Clip(line2, 48), clrSilver, 8, "Segoe UI");
}

void DrawBotCard(const string suffix, const int y, const string title, const color tone, const string line1, const string line2, const string line3)
{
   Rectangle(suffix + "BOX", INNER_X, y, INNER_W, 86, C'7,21,30', C'0,68,98');
   Label(suffix + "TITLE", 28, y + 10, title, tone, 10, "Segoe UI");
   Label(suffix + "L1", 38, y + 33, "- " + Clip(line1, 45), clrWhite, 8, "Segoe UI");
   Label(suffix + "L2", 38, y + 50, "- " + Clip(line2, 45), clrSilver, 8, "Segoe UI");
   Label(suffix + "L3", 38, y + 67, "- " + Clip(line3, 45), clrSilver, 8, "Segoe UI");
}

void DrawHoldCard(const string positionState, const string holdReason)
{
   int y = 554;
   Rectangle("HOLD", INNER_X, y, INNER_W, 88, C'7,21,30', C'0,68,98');
   Label("HOLD_TITLE", 28, y + 10, "LY DO HOLD LENH", clrDeepSkyBlue, 10, "Segoe UI");
   if(positionState == "MANAGING")
   {
      string a, b, c, d;
      ReasonLines(holdReason, 44, a, b, c, d);
      Label("HOLD_1", 38, y + 33, "+ " + Clip(a, 44), clrWhite, 8, "Segoe UI");
      Label("HOLD_2", 38, y + 50, "+ " + Clip(b, 44), clrSilver, 8, "Segoe UI");
      Label("HOLD_3", 38, y + 67, "+ " + Clip(c, 44), clrSilver, 8, "Segoe UI");
   }
   else
   {
      Label("HOLD_1", 38, y + 33, "+ Chua co vi the dang mo", clrWhite, 8, "Segoe UI");
      Label("HOLD_2", 38, y + 50, "+ Bot dang cho setup hop le", clrSilver, 8, "Segoe UI");
      Label("HOLD_3", 38, y + 67, "+ Panel chi doc, khong gui lenh", clrSilver, 8, "Segoe UI");
   }
}

void DrawFooter()
{
   Rectangle("FOOT", INNER_X, 654, INNER_W, 26, C'6,18,26', C'0,68,98');
   Label("FOOT1", 24, 661, "READ ONLY | DEMO | ORDER PERMISSION = NONE", clrSilver, 7, "Segoe UI");
   Label("FOOT2", 268, 661, "BE +6 | PARTIAL +10 (1/3)", clrSilver, 7, "Segoe UI");
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
   string modeText = DisplayMode(activeMode, strategy);
   color modeTone = ModeColor(activeMode, strategy);
   color stateTone = StageColor(stage, approved, positionState);

   bool managing = positionState == "MANAGING" || positionState == "UNMANAGED";
   string entry = CleanValue(managing ? Field(payload, "positionEntry") : Field(payload, "entry"), "Dang cho");
   string stopLoss = CleanValue(managing ? Field(payload, "positionStopLoss") : Field(payload, "stopLoss"), "Chua co");
   string tp = CleanValue(managing ? Field(payload, "positionTp2") : Field(payload, "tp2"), "Chua co");
   if(tp == "Chua co")
      tp = CleanValue(managing ? Field(payload, "positionTp1") : Field(payload, "tp1"), "Chua co");

   string stateTitle = "BOT DANG CHO SETUP";
   string stateLine1 = "Stage: " + stage;
   string stateLine2 = "Hanh dong: Khong mo lenh moi";
   if(positionState == "MANAGING")
   {
      stateTitle = "DANG GIU LENH " + CleanValue(Field(payload, "positionSide"), "");
      stateLine1 = "Ticket: " + CleanValue(Field(payload, "ticket"), "-") + " | Lot: " + CleanValue(Field(payload, "positionVolume"), "-");
      stateLine2 = "P/L: " + CleanValue(Field(payload, "floatingPnlUsd"), "-") + " USD";
   }
   else if(approved == "true")
   {
      stateTitle = "SETUP HOP LE";
      stateLine1 = "Stage: " + stage;
      stateLine2 = "Cho entry gate va risk gate";
   }

   DrawBase();
   DrawHeader(modeText, regime, confidence, modeTone);
   DrawTradeBox(entry, stopLoss, tp);
   DrawStateCard(stateTitle, stateLine1, stateLine2, stateTone);

   DrawBotCard(
      "TREND", 280, "TREND BOT", clrDeepSkyBlue,
      "Regime TREND, mode AUTO/TREND",
      "M15 dong nen co mau hinh hop le",
      "ST M15/M5 cung huong; SL 6-10, >10 cho pullback"
   );
   DrawBotCard(
      "SIDEWAY", 372, "SIDEWAY BOT", clrAqua,
      "Gia cham vung supply/demand",
      "Tin hieu dao chieu tai bien range",
      "Risk % hop le; lot khong vuot max lot"
   );
   DrawBotCard(
      "REVERSAL", 464, "REVERSAL FILTER", clrMagenta,
      "CHOCH/cau truc bao kha nang dao chieu",
      "Recommended mode PAUSE khi rui ro cao",
      "Khong mo lenh moi de bao ve tai khoan"
   );

   DrawHoldCard(positionState, Field(payload, "holdReason"));
   DrawFooter();
   ChartRedraw();
}

void RenderError(const string title, const string message)
{
   DeletePanel();
   Rectangle("BG", 0, 0, PANEL_WIDTH, 260, C'4,13,20', C'180,60,60');
   Rectangle("TOP", 8, 6, PANEL_WIDTH - 16, 3, clrTomato, clrTomato);
   Label("TITLE", 26, 28, "XAUUSD AI MASTER", clrDeepSkyBlue, 14, "Segoe UI");
   Label("VER", 342, 30, "vFinal", clrGold, 8, "Segoe UI");
   Label("ERR", 26, 68, title, clrTomato, 11, "Segoe UI");
   Label("MSG", 26, 96, Clip(message, 54), clrWhite, 8, "Segoe UI");
   Label("HELP1", 26, 132, "1. Bat Allow WebRequest: http://127.0.0.1:3711", clrSilver, 8, "Segoe UI");
   Label("HELP2", 26, 154, "2. Kiem tra Control API/Bridge dang chay", clrSilver, 8, "Segoe UI");
   Label("HELP3", 26, 176, "3. Attach lai EA panel neu can", clrSilver, 8, "Segoe UI");
   Label("FOOT", 26, 220, "READ ONLY | DEMO | ORDER PERMISSION = NONE", clrSilver, 7, "Segoe UI");
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
