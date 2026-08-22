#property copyright "XAUUSD AI MASTER"
#property version   "1.29"
#property description "Read-only Phase 7C UI v5.2 wide state-based decision panel"

input string InpApiUrl = "http://127.0.0.1:3711/api/v1/phase7c/decision-monitor/mt5?symbol=XAUUSD";
input int InpRefreshSeconds = 3;
input ENUM_BASE_CORNER InpCorner = CORNER_LEFT_UPPER;
input int InpX = 12;
input int InpY = 28;
input int InpFontSize = 9;

const string PREFIX = "XAU_AI_P7C_";
const int PANEL_WIDTH = 840;
const int PANEL_HEIGHT = 530;
const int INNER_X = 12;
const int INNER_W = 816;
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
   StringReplace(text, "PAUSE chặn mọi lệnh mới; không thay đổi vị thế đang được quản lý.", "PAUSE chan lenh moi\nKhong doi vi the dang quan ly");
   StringReplace(text, "A confirmed CHOCH indicates a possible structural reversal.", "CHOCH xac nhan kha nang dao chieu.");
   StringReplace(text, "Bollinger bandwidth is", "Bollinger bandwidth:");
   StringReplace(text, "No valid setup", "Chua co setup hop le");
   StringReplace(text, "panel does not have order permission", "panel chi doc, khong gui lenh");
   StringReplace(text, "panel khong co quyen gui lenh", "panel chi doc, khong gui lenh");
   StringReplace(text, "panel không có quyền gửi lệnh", "panel chi doc, khong gui lenh");
   StringReplace(text, "Chờ setup hợp lệ", "Cho setup hop le");
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

void ReasonLines4(const string value, const int maximum, string &line1, string &line2, string &line3, string &line4)
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

   string rest1, rest2, rest3;
   TakeLine(compact, maximum, line1, rest1);
   TakeLine(rest1, maximum, line2, rest2);
   TakeLine(rest2, maximum, line3, rest3);
   line4 = Clip(rest3, maximum);
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
   Rectangle("HEAD", INNER_X, 10, INNER_W, 112, C'16,22,31', C'44,58,76');
   Label("TITLE", 24, 17, "XAUUSD AI MASTER", clrDeepSkyBlue, 14, "Segoe UI");
   Label("VERSION", 760, 19, "UI v5.2", clrGold, 9, "Segoe UI");
   Label("SUBTITLE", 24, 43, "Phase 7C | DEMO | READ ONLY | ORDER NONE", clrSilver, 9, "Segoe UI");
   Label("MODE", 24, 67, "Mode: " + activeMode + " -> " + strategy, activeMode == "AUTO" ? clrLimeGreen : clrGold, 9, "Segoe UI");
   Label("REGIME", 24, 89, "Regime: " + regime, RegimeColor(regime), 9, "Segoe UI");
   Label("CONF", 300, 89, "Confidence: " + confidence, clrGold, 9, "Segoe UI");
}

void DrawFooter(const int y)
{
   Rectangle("FOOT", INNER_X, y, INNER_W, 50, C'18,23,31', C'42,54,69');
   Label("SAFETY1", 24, y + 10, "READ ONLY | DEMO | ORDER PERMISSION = NONE", clrSilver, 9, "Segoe UI");
   Label("SAFETY2", 24, y + 30, "BE +6 | PARTIAL +10 (1/3)", clrSilver, 9, "Segoe UI");
}

void DrawInfoPair(const string id, const int xLabel, const int xValue, const int y, const string label, const string value, const color valueColor)
{
   Label(id + "L", xLabel, y, label, clrSilver, 9, "Segoe UI");
   Label(id + "V", xValue, y, value, valueColor, 9, "Segoe UI");
}

void DrawBullets4(const string suffix, const int y, const string title, const string sourceText, const int maxChars)
{
   string line1, line2, line3, line4;
   ReasonLines4(sourceText, maxChars, line1, line2, line3, line4);
   Rectangle(suffix + "BOX", INNER_X, y, INNER_W, 126, C'22,27,36', C'50,63,80');
   Label(suffix + "HEAD", 24, y + 10, title, clrDeepSkyBlue, 11, "Segoe UI");
   Label(suffix + "L1", 34, y + 38, StringLen(line1) > 0 ? "- " + line1 : "- Dang cho du lieu", clrWhite, 9, "Segoe UI");
   Label(suffix + "L2", 34, y + 60, StringLen(line2) > 0 ? "- " + line2 : " ", clrSilver, 9, "Segoe UI");
   Label(suffix + "L3", 34, y + 82, StringLen(line3) > 0 ? "- " + line3 : " ", clrSilver, 9, "Segoe UI");
   Label(suffix + "L4", 34, y + 104, StringLen(line4) > 0 ? "- " + line4 : " ", clrSilver, 9, "Segoe UI");
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
   string reasonText = limitReason + "\n" + entryReason + "\n" + holdReason;
   string stateText = stage == "BLOCKED" ? "BOT DANG CHO SETUP" : "BOT DANG THEO DOI";
   color stateColor = stage == "BLOCKED" ? clrOrange : clrGold;

   DrawBase(PANEL_HEIGHT);
   DrawHeader(activeMode, strategy, regime, confidence);

   Rectangle("STATUS", INNER_X, 132, INNER_W, 64, C'24,33,43', stateColor);
   Label("STATUS_TITLE", 24, 144, stateText, stateColor, 14, "Segoe UI");
   Label("STATUS_1", 24, 170, "Stage: " + stage, clrWhite, 9, "Segoe UI");
   Label("STATUS_2", 210, 170, "Hanh dong: khong mo lenh moi", clrSilver, 9, "Segoe UI");

   DrawBullets4("REASON", 208, "LY DO CHO", reasonText, 94);

   Rectangle("RULES", INNER_X, 346, INNER_W, 112, C'22,27,36', C'50,63,80');
   Label("RULES_HEAD", 24, 356, "QUY TAC GIAO DICH", clrDeepSkyBlue, 11, "Segoe UI");
   Label("RULE1", 34, 382, "- Stoploss chuan: 6-10 gia", clrWhite, 9, "Segoe UI");
   Label("RULE2", 34, 404, "- SL > 10 gia: cho pullback sau nen M15 xac nhan", clrWhite, 9, "Segoe UI");
   Label("RULE3", 34, 426, "- BE: +6", clrWhite, 9, "Segoe UI");
   Label("RULE4", 220, 426, "- Partial: +10, chot 1/3 vi the", clrWhite, 9, "Segoe UI");

   DrawFooter(468);
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

   DrawBase(PANEL_HEIGHT);
   DrawHeader(activeMode, strategy, regime, confidence);

   Rectangle("STATUS", INNER_X, 132, INNER_W, 58, C'24,33,43', clrLimeGreen);
   Label("STATUS_TITLE", 24, 144, "SETUP HOP LE", clrLimeGreen, 14, "Segoe UI");
   Label("STATUS_NOTE", 24, 170, "Stage: " + stage + " | cho entry gate", clrWhite, 9, "Segoe UI");

   Rectangle("PLAN", INNER_X, 204, INNER_W, 136, C'22,27,36', C'50,63,80');
   Label("PLAN_HEAD", 24, 214, "KE HOACH LENH", clrDeepSkyBlue, 11, "Segoe UI");
   DrawInfoPair("P1", 34, 160, 242, "Diem vao", entry, clrWhite);
   DrawInfoPair("P2", 34, 160, 264, "Stoploss", stopLoss, clrTomato);
   DrawInfoPair("P3", 34, 160, 286, "Khoang SL", distance, clrWhite);
   DrawInfoPair("P4", 34, 160, 308, "Lot", volume, clrAqua);
   DrawInfoPair("Q1", 430, 555, 242, "TP1", tp1, clrLimeGreen);
   DrawInfoPair("Q2", 430, 555, 264, "TP2", tp2, clrLimeGreen);
   DrawInfoPair("Q3", 430, 555, 286, "Huong", side, clrGold);
   DrawInfoPair("Q4", 430, 555, 308, "Risk USD", riskUsd, clrSilver);
   Label("SETUP", 34, 330, "Setup: " + Clip(setup, 80), clrSilver, 9, "Segoe UI");

   DrawBullets4("REASON", 354, "LY DO VAO LENH", Field(payload, "entryReason"), 94);
   DrawFooter(468);
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

   DrawBase(PANEL_HEIGHT);
   DrawHeader(activeMode, strategy, regime, confidence);

   Rectangle("STATUS", INNER_X, 132, INNER_W, 58, C'24,33,43', clrLimeGreen);
   Label("STATUS_TITLE", 24, 144, "DANG GIU LENH " + side, clrLimeGreen, 14, "Segoe UI");
   Label("STATUS_NOTE", 24, 170, "Ticket: " + ticket + " | Lot: " + volume + " | P/L: " + pnl + " USD", ProfitColor(pnl), 9, "Segoe UI");

   Rectangle("PLAN", INNER_X, 204, INNER_W, 136, C'22,27,36', C'50,63,80');
   Label("PLAN_HEAD", 24, 214, "QUAN LY VI THE", clrDeepSkyBlue, 11, "Segoe UI");
   DrawInfoPair("P1", 34, 160, 242, "Entry", entry, clrWhite);
   DrawInfoPair("P2", 34, 160, 264, "Gia hien tai", current, clrWhite);
   DrawInfoPair("P3", 34, 160, 286, "Stoploss", stopLoss, clrTomato);
   DrawInfoPair("P4", 34, 160, 308, "P/L USD", pnl, ProfitColor(pnl));
   DrawInfoPair("Q1", 430, 555, 242, "TP1", tp1, clrLimeGreen);
   DrawInfoPair("Q2", 430, 555, 264, "TP2", tp2, clrLimeGreen);
   DrawInfoPair("Q3", 430, 555, 286, "BE", be, clrAqua);
   DrawInfoPair("Q4", 430, 555, 308, "Partial", partial, clrAqua);

   DrawBullets4("REASON", 354, "LY DO GIU LENH", Field(payload, "holdReason"), 94);
   DrawFooter(468);
   ChartRedraw();
}

void RenderError(const string title, const string message, const bool showWebRequestHelp)
{
   DrawBase(380);
   Rectangle("STATUS", INNER_X, 70, INNER_W, 72, C'55,30,30', C'210,70,70');
   Rectangle("HELP", INNER_X, 158, INNER_W, 140, C'22,27,36', C'50,63,80');
   Rectangle("FOOT", INNER_X, 314, INNER_W, 50, C'18,23,31', C'42,54,69');

   Label("TITLE", 24, 18, "XAUUSD AI MASTER", clrDeepSkyBlue, 14, "Segoe UI");
   Label("VERSION", 760, 19, "UI v5.2", clrGold, 9, "Segoe UI");
   Label("SUBTITLE", 24, 43, "Phase 7C | DEMO | READ ONLY | ORDER NONE", clrSilver, 9, "Segoe UI");
   Label("STATUS_TITLE", 24, 84, title, clrTomato, 12, "Segoe UI");
   Label("STATUS_NOTE", 24, 112, Clip(message, 100), clrWhite, 9, "Segoe UI");

   Label("HELP_HEAD", 24, 172, "HUONG DAN", clrDeepSkyBlue, 11, "Segoe UI");
   if(showWebRequestHelp)
   {
      Label("HELP1", 34, 200, "1. Tools > Options > Expert Advisors", clrWhite, 9, "Segoe UI");
      Label("HELP2", 34, 222, "2. Allow WebRequest: http://127.0.0.1:3711", clrGold, 9, "Segoe UI");
      Label("HELP3", 34, 244, "3. Remove EA cu va attach lai panel neu chart chua cap nhat", clrSilver, 9, "Segoe UI");
   }
   else
   {
      Label("HELP1", 34, 200, "API/Bridge dang khoi tao hoac tam thoi loi.", clrWhite, 9, "Segoe UI");
      Label("HELP2", 34, 222, "Panel tu dong tai lai moi " + IntegerToString(InpRefreshSeconds) + " giay.", clrGold, 9, "Segoe UI");
      Label("HELP3", 34, 244, "Giu MT5 va Control API dang chay.", clrSilver, 9, "Segoe UI");
   }

   Label("SAFETY1", 24, 326, "READ ONLY | DEMO | ORDER PERMISSION = NONE", clrSilver, 9, "Segoe UI");
   Label("SAFETY2", 24, 346, "BE +6 | PARTIAL +10 (1/3)", clrSilver, 9, "Segoe UI");
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
