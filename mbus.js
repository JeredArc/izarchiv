import { mbusTimezoneOffset, mbusTelTimeHeader } from "./settings.js";


function toLetterNumerals(num) {
	if(!num) return "";
	let c = s => s.charCodeAt(0);
	let r = "";
	while(num) {
		r = String.fromCharCode(c("A") + (num - 1) % 26) + r;
		num = Math.trunc((num - 1) / 26);
	}
	return r;
}

function hexToDec(hex) {
	let result = parseInt(hex, 16);
	if(isNaN(result)) throw `Funktion hexToDec: <${hex}> konnte nicht interpretiert werden.`;
	return result;
}

function hexToDecArray(bytes) {
	return (bytes.match(/.{2}/g) ?? []).map(b => hexToDec(b));
}

function decToHex(dec) { /* also takes an array of numbers */
	return [dec].flat().reduce((r, d) => r + d.toString(16).toUpperCase().padStart(2, "0"), "");
}

function hexToString(hex) {
	return hex.match(/[0-9a-fA-F]{2}/g).map(c => String.fromCharCode(parseInt(c, 16))).join("");
}

function hexbcdToDec(bcd) {
	return parseInt(bcd);
}

function shiftStrip(v, shift, strip) {
	if(typeof v != "number") v = hexToDec(v);
	return v >> shift & (2 ** strip - 1);
}

function parseMbusRawDate(bytes) {
	let timestamp = parseInt(bytes.match(/.{2}/g).reverse().join(""), 16);
	return parseMbusDate(timestamp, bytes.length > 4);
}

function parseMbusDate(data, datetime=true) {
	let shift = datetime ? 16 : 0;
	let date = {
		day:    shiftStrip(data,  0 + shift, 5),
		month:  shiftStrip(data,  8 + shift, 4),
		year: ((shiftStrip(data, 12 + shift, 4) << 3) | shiftStrip(data, 5 + shift, 3)) + 2000,
	};
	if(datetime) Object.assign(date, {
		min:    shiftStrip(data,  0, 6),
		hour:   shiftStrip(data,  8, 5),
		dst:  !!shiftStrip(data, 15, 1),
	});
	date.timestamp = Date.UTC(date.year, date.month - 1, date.day, date.hour ?? 0, date.min ?? 0) / 1000 - (date.dst ? 3600 : 0) - mbusTimezoneOffset * 60;
	date.str = `${String(date.day).padStart(2, "0")}.${String(date.month).padStart(2, "0")}.${String(date.year).padStart(4, "0")}`
		+ (datetime ? ` ${String(date.hour).padStart(2, "0")}:${String(date.min).padStart(2, "0")}${date.dst ? " DST" : ""}` : "");
	return date;
}

function parseMbusManufacturer(bytes) {
	/* Manufacturer, for a list see e.g. https://www.m-bus.de/man.html */
	const manufacturers = {
		"DME": "DIEHL Metering",
		"HYD": "Hydrometer GmbH",
	}
	let manufacturer = hexToDec(bytes);
	manufacturer = [2,1,0].map(i => String.fromCharCode(shiftStrip(manufacturer, 5 * i, 5) + 64)).join("");
	if(manufacturer in manufacturers) manufacturer += ` (${manufacturers[manufacturer]})`;
	return manufacturer;
}

function parseMbusMedium(byte) {
	/* Medium, see also https://www.m-bus.de/medium.html */
	const mediums = {
		"00": "Anderes",                      /* Other */
		"01": "Öl",                           /* Oil */
		"02": "Elektrizität",                 /* Electricity */
		"03": "Gas",                          /* Gas */
		"04": "Wärme (Rücklauf)",             /* Heat (Volume measured at return temperature: outlet) */
		"05": "Dampf",                        /* Steam */
		"06": "Warmwasser",                   /* Hot Water */
		"07": "Wasser",                       /* Water */
		"08": "Heizkostenverteiler",          /* Heat Cost Allocator */
		"09": "Pressluft",                    /* Compressed Air */
		"0A": "Kühlung (Rücklauf)",           /* Cooling load meter (Volume measured at return temperature: outlet) */
		"0B": "Kühlung (Vorlauf)",            /* Cooling load meter (Volume measured at flow temperature: inlet) */
		"0C": "Wärme (Vorlauf)",              /* Heat (Volume measured at flow temperature: inlet) */
		"0D": "Wärme / Kühlung",              /* Heat / Cooling load meter */
		"0E": "Bus / System",                 /* Bus / System */
		"0F": "Unbekannt",                    /* Unknown Medium */
		"14": "Heiz-/Brennwert",              /* Calorific value */
		"15": "Heißwasser",                   /* Boiling water */
		"16": "Kaltwasser",                   /* Cold Water */
		"17": "Mischwasser",                  /* Dual Water */
		"18": "Druck",                        /* Pressure */
		"19": "A/D Wandler",                  /* A/D Converter */
		"1A": "Rauchmelder",                  /* Smoke detector */
		"1B": "Raumsensor",                   /* Room sensor */
		"1C": "Gasdetektor",                  /* Gas detector */
		"20": "Unterbrecher (Elektrizität)",  /* Circuit breaker */
		"21": "Ventil",                       /* Ventil */
		"25": "Anzeige",                      /* Display */
		"28": "Abwasser",                     /* Sewage */
		"29": "Abfall",                       /* Waste */
		"2A": "Kohlendioxid",                 /* Carbon dioxide */
	};
	return mediums[byte] ?? "Reserviert";
}

/* parse a single MBus telegram represented as a string of hex digits */
export function parseMbusTelegram(tel) {
	tel = tel.toUpperCase();

	let record = {telUID: ["........", "........", ".."], mbusTel: tel};
	let warn = (msg) => (record.warnings ??= []).push(msg);

	let bytes = tel.match(/.{2}/g) ?? [];
	let nextIndex = 0;
	let currentBytes = "";
	let next = (len=1, decimal=false) => {
		currentBytes = "";
		for(let i = 0; i < len; i++) {
			if(nextIndex < bytes.length) currentBytes = bytes[nextIndex++] + currentBytes;
			else throw { msg: "Unerwartet Ende des Telegramms erreicht!", record };
		}
		return currentBytes;
	};


	/* The following parsing is based on the MBus-Documentation found at https://m-bus.com/assets/downloads/MBDOC48.PDF */
	/* written by Gerhard Pfister, 2020 */


	/* Start */
	if(next() != "68") throw { msg: `Unerwartetes Start-Byte <${currentBytes}>, nur Long Frame <68> implementiert!`, record };

	/* L-Field */
	let lField = next();
	if(hexToDec(lField) != bytes.length - 6) throw { msg: `Falsche Länge im L-Field-Byte <${currentBytes}>, <${decToHex(bytes.length - 6)}> erwartet!`, record };
	if(hexToDec(lField) <= 3) throw { msg: `Control Frame gefunden (L-Field <${currentBytes}>), nur Long Frame implementiert (L-Field > 3, Gesamtlänge > 9)`, record };

	/* L-Field */
	if(next() != lField) warn(`Falsches L-Field-Wiederholung-Byte <${currentBytes}>, <${lField}> erwartet!`);

	/* Start */
	if(next() != "68") throw { msg: `Unerwartetes Start-Wiederholung-Byte <${currentBytes}>, <68> erwartet!`, record };

	/* C-Field */
	record.mbusCField = next();
	if(record.mbusCField != "08") warn(`Unerwartetes C-Field-Byte <${currentBytes}>, nur <08> implementiert!`);

	/* A-Field */
	record.mbusAField = next();

	/* CI-Field */
	record.mbusCIField = next();
	if(record.mbusCIField != "72" && record.mbusCIField != "76") throw { msg: `Unerwartetes CI-Field-Byte <${currentBytes}>, nur <72> oder <76> (Variable Data Structure) implementiert!`, record };


	/* Fixed Data Header (the following 12 bytes) */

	/* Identification Number */
	record.mbusId = next(4);
	record.telUID[1] = record.mbusId;

	/* Manufacturer */
	record.mbusManufacturer = parseMbusManufacturer(next(2));

	/* Version Number */
	record.mbusVersion = next();

	/* Medium */
	record.mbusMedium = parseMbusMedium(next());

	/* Access Number */
	record.mbusAccessNr = next();

	/* Status, 2 lowest bits indicate error */
	record.mbusStatus = next();
	let statusError = shiftStrip(record.mbusStatus, 0, 2);
	let statusErrors = ["No Error", "Application Busy", "Any Application Error", "Reserved"];
	if(statusError) warn(`Status <${currentBytes}> enthält Fehler: ${statusErrors[statusError]}`);

	/* Signature */
	if(next(2) != "0000") warn(`Ungültige Signatur <${currentBytes}>, sollte immer <0000> sein!`);


	/* Data Records */
	let dataRecordIndex = 0;
	while(nextIndex < bytes.length - 2) {
		/*

		DATA INFORMATION BLOCK:

		DIF (Documentation pp. 38, 39)
		-––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
		|  7.  (8)  |  6.  (4)  |  5.  (2)  |  4.  (1)  |  3.  (8)  |  2.  (4)  |  1.  (2)  |  0.  (1)  |
		–––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
		| Extension |LSB of Sto-|    Function Field     |                  Data Field:                  |
		|    Bit    |rage Number|                       |           Length and coding of data           |
		–––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

		Function Field:
		––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
		| [00] Instantaneous value | [01] Maximum value | [10] Minimum value | [11] Value during error state |
		––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

		Data Field:
		––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
		|      DATA LENGTH      ||     CODE     |     MEANING      ||     CODE     |         MEANING         |
		––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
		|   0 bit /  0 nibbles  ||  [0000] <0>  |     No Data      ||  [1000] <8>  |  Selection for Readout  |
		––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
		|   8 bit /  2 nibbles  ||  [0001] <1>  |   8 Bit Integer  ||  [1001] <9>  |       2 digit BCD       |
		––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
		|  16 bit /  4 nibbles  ||  [0010] <2>  |  16 Bit Integer  ||  [1010] <A>  |       4 digit BCD       |
		––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
		|  24 bit /  6 nibbles  ||  [0011] <3>  |  24 Bit Integer  ||  [1011] <B>  |       6 digit BCD       |
		––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
		|  32 bit /  8 nibbles  ||  [0100] <4>  |  32 Bit Integer  ||  [1100] <C>  |       8 digit BCD       |
		––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
		|  32 bit  OR variable  ||  [0101] <5>  |   32 Bit Real    ||  [1101] <D>  |     variable length     |
		––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
		|  48 bit / 12 nibbles  ||  [0110] <6>  |  48 Bit Integer  ||  [1110] <E>  |      12 digit BCD       |
		––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
		|  64 bit / 16 nibbles  ||  [0111] <7>  |  64 Bit Integer  ||  [1111] <F>  |    Special Functions    |
		––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

		DIFE (Documentation p. 41)
		–––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
		|  7.  (8)  |  6.  (4)  |  5.  (2)  |  4.  (1)  |  3.  (8)  |  2.  (4)  |  1.  (2)  |  0.  (1)  |
		–––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
		| Extension | (Device)  |        Tariff         |                Storage Number                 |
		|    Bit    |   Unit    |                       |                                               |
		–––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

		VALUE INFORMATION BLOCK:

		VIF, VIFE (Documentation pp. 42, list of codes 78, list of codes in VIFE extension 80)
		–––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
		|  7.  (8)  |  6.  (4)  |  5.  (2)  |  4.  (1)  |  3.  (8)  |  2.  (4)  |  1.  (2)  |  0.  (1)  |
		–––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
		| Extension |                            Unit and multiplier (value)                            |
		|    Bit    |                                                                                   |
		–––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

		EXAMPLES FOR DATA RECORD HEADER |DIF DIFE-VIF VIFE|  DIF        DIFE      - VIF        VIFE       |
		–––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
		Gerät HYDRUS Wasser:
		|  Volumen 1                    |  0C    - 13     |  0000 1100            - 0001 0011             |
		|  Volumen 1a                   |  8C 10 - 13     |  1000 1100  0001 0000 - 0001 0011             |
		|  Volumen 1b                   |  8C 20 - 13     |  1000 1100  0010 0000 - 0001 0011             |
		|  Durchfluss                   |  0B    - 3B     |  0000 1011            - 0011 1011             |
		|  Betriebszeit                 |  0B    - 26     |  0000 1011            - 0010 0110             |
		|  Vorlauftemp                  |  02    - 5A     |  0000 0010            - 0101 1010             |
		|  Außentemp                    |  02    - 66     |  0000 0010            - 0110 0110             |
		|  Zeitpunkt                    |  04    - 6D     |  0000 0100            - 0110 1101             |
		|  Volumen 2                    |  4C    - 13     |  0100 1100            - 0001 0011             |
		|  Volumen 2a                   |  CC 10 - 13     |  1100 1100  0001 0000 - 0001 0011             |
		|  Volumen 2b                   |  CC 20 - 13     |  1100 1100  0010 0000 - 0001 0011             |
		|  Zeitraum von                 |  42    - 6C     |  0100 0010            - 0110 1100             |
		|  Zeitraum bis                 |  42    - EC 7E  |  0100 0010            - 1110 1100  0111 1110  |
		–––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––
		Gerät IZAR-Center (memory):
		|  Erweiterte Identifikation    |  06    - 79     |  0000 0110            - 0111 1001             |
		|  Firmware Versionsnnummer     |  0A    - FD 0E  |  0000 1010            - 1111 1101  0000 1110  |
		|  Fehlerzeichen                |  01    - FD 17  |  0000 0001            - 1111 1101  0001 0111  |
		|  Strom [mA]                   |  02    - FD 59  |  0000 0010            - 1111 1101  0101 1001  |
		|  Spannung 1 [mV]              |  02    - FD 47  |  0000 0010            - 1111 1101  0100 0111  |
		|  Spannung 2 [mV]              |  82 40 - FD 47  |  1000 0010  0100 0000 - 1111 1101  0100 0111  |
		|  Spannung 3 [mV]              |  82 41 - FD 47  |  1000 0010  0100 0001 - 1111 1101  0100 0111  |
		|  Kein VIF                     |  02    - FD 3A  |  0000 0010            - 1111 1101  0011 1010  |
		|  Außentemp2                   |  02    - 65     |  0000 0010            - 0110 0101             |
		|  Baudrate                     |  01    - FD 1C  |  0000 0001            - 1111 1101  0001 1100  |
		|  Tage seit letzter Auslesung  |  04    - FD 2F  |  0000 0100            - 1111 1101  0010 1111  |
		|  Erste Speichernummer         |  04    - FD 20  |  0000 0100            - 1111 1101  0010 0000  |
		|  Zugriffsnummer               |  04    - FD 08  |  0000 0100            - 1111 1101  0000 1000  |
		|  Letzte Speichernummer        |  04    - FD 21  |  0000 0100            - 1111 1101  0010 0001  |
		|  Kundenort                    |  0D    - FD 10  |  0000 1101            - 1111 1101  0001 0000  |
		|  Herstellerspezifisch         |  0C    - 7F     |  0000 1100            - 0111 1111             |
		–––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––––

		*/

		let dif_bytes = next(), dif = hexToDec(dif_bytes);
		if(dif == 0x0F || dif == 0x1F) { /* is MDH -> all remaining bytes are manufacturer specific data */
			record.mbusManufacturerData = next(bytes.length - 2 - nextIndex);
			break;
		}

		dataRecordIndex++;

		let dife = "";
		while(shiftStrip(currentBytes, 7, 1)) dife += next();

		let vif_bytes = next(), vif = hexToDec(vif_bytes), vif_string = null;
		if(shiftStrip(vif, 0, 7) == 0b1111100) { /* VIF in following string, Documentation p. 79 */
			let vif_len = hexToDec(next());
			let vif_string = hexToString(next(vif_len));
			currentBytes = 0;
		}
		let vife_bytes = "", vife;
		while(shiftStrip(currentBytes, 7, 1)) vife_bytes += next();
		vife = hexToDecArray(vife_bytes);
		let drh = `${dif_bytes}${dife}-${vif_bytes}${vife_bytes}`;
		let warnPrefix = `Data Record #${dataRecordIndex} <${drh}>: `;

		let dif_functionField = shiftStrip(dif, 4, 2);
		let dif_functionFieldText = ([null /* Instantaneous value */, "Max", "Min", "Err"])[dif_functionField];


		let dif_dataField = shiftStrip(dif, 0, 4); /* Documentation p. 39 */
		if(dif_dataField == 0b1000) warn(`${warnPrefix}DIF Data Field [1000] (Selection for Readout) nicht implementiert!`);
		if(dif_dataField == 0b0101) warn(`${warnPrefix}DIF Data Field [0101] (32 Bit Real) nicht implementiert!`);
		if(dif_dataField == 0b1111) warn(`${warnPrefix}DIF Data Field [1111] (Special Functions) nicht implementiert!`);

		let dif_storageNr = shiftStrip(dif, 6, 1);
		let dif_tariffNr = 0;
		let dif_deviceNr = 0;
		hexToDecArray(dife).forEach((b, i) => {
			dif_storageNr += shiftStrip(b, 0, 4) << (1 + 4 * i);
			dif_tariffNr  += shiftStrip(b, 4, 2) << (2 * i);
			dif_deviceNr  += shiftStrip(b, 6, 1) << (1 * i);
		});

		let data, data_bytes, data_len, data_isText = false, data_isBcd = false;
		if(dif_dataField == 0b1101) { /* variable length data */
			data_len = hexToDec(next());
			if(data_len <= 0xBF) data_isText = true;
			else throw { msg: `${warnPrefix}Unerwartetes LVAR-Byte <${currentBytes}> für variable Länge, nur LVAR ≤ <BF> implementiert!`, record };
		}
		else {
			data_len = shiftStrip(dif_dataField, 0, 3);
			if(data_len == 0b101) data_len = 4;
			else if(data_len == 0b111) data_len = 8;
			data_isBcd = !!shiftStrip(dif_dataField, 3, 1);
		}
		data = data_bytes = next(data_len);
		if(data_isText) {
			data = hexToString(data);
		}
		else if(data) {
			data = data_isBcd ? hexbcdToDec(data) : hexToDec(data);
			if(isNaN(data)) {
				data = data_bytes;
				warn(`${warnPrefix}Wert <${data_bytes}> konnte nicht interpretiert werden!`);
			}
		}

		/* Units and Multipliers are read from the VIF, see Documentation p. 78 */
		let dataName = null;

		if(vif_string) {
			dataName = vif_string;
		}
		else {
			let durationUnits = ["s", "min", "h", "d", "mo", "y"];
			let getDurationUnit = (n) => durationUnits[n];
			let getLongDurationUnit = (n) => durationUnits.slice(2)[n];
			let getDateTimeFunc = (datetime=null) => (n) => ([data,, data_len, drh]) => {
				let date = parseMbusDate(data, datetime ?? (data_len == 4));
				if(drh == mbusTelTimeHeader) {
					record.telTimestr = date.str;
					record.telTimestamp = date.timestamp;
					record.telUID[0] = `${String(date.year).padStart(2, "0").slice(-2)}${String(date.month).padStart(2, "0")}${String(date.day).padStart(2, "0")}`
						+`${String(date.hour).padStart(2, "0")}${String(date.min).padStart(2, "0")}`;
				}
				return date.str;
			}
			let getMedium = (n) => ([,data_bytes]) => parseMbusMedium(data_bytes);
			let getManufacturer = (n) => ([,data_bytes]) => parseMbusManufacturer(data_bytes);
			let vif_patterns = [
				/* [ RegEx search on binary rep of VIF, description of the value, multiplier, unit ]  Documentation p. 78 */
				[ /^.0000(...)$/, "Energie",                             (n) => ({exp10: n-3 }),     "Wh"                ], /* Energy */
				[ /^.0001(...)$/, "Energie",                             (n) => ({exp10: n }),       "J"                 ], /* Energy */
				[ /^.0010(...)$/, "Volumen",                             (n) => ({exp10: n-3 }),     "l"                 ], /* Volume */
				[ /^.0011(...)$/, "Masse",                               (n) => ({exp10: n-3 }),     "kg"                ], /* Mass */
				[ /^.01000(..)$/, "On-Zeit",                             1,                          getDurationUnit     ], /* On Time */
				[ /^.01001(..)$/, "Betriebszeit",                        1,                          getDurationUnit     ], /* Operating Time */
				[ /^.0101(...)$/, "Leistung",                            (n) => ({exp10: n-3 }),     "W"                 ], /* Power */
				[ /^.0110(...)$/, "Leistung",                            (n) => ({exp10: n }),       "J/h"               ], /* Power */
				[ /^.0111(...)$/, "Volumens-Durchfluss",                 (n) => ({exp10: n-3 }),     "l/h"               ], /* Volume Flow */
				[ /^.1000(...)$/, "Volumens-Durchfluss extern",          (n) => ({exp10: n-4 }),     "l/min"             ], /* Volume Flow ext. */
				[ /^.1001(...)$/, "Volumens-Durchfluss extern",          (n) => ({exp10: n-6 }),     "l/s"               ], /* Volume Flow ext. */
				[ /^.1010(...)$/, "Massen-Durchfluss",                   (n) => ({exp10: n-3 }),     "kg/h"              ], /* Mass flow */
				[ /^.10110(..)$/, "Vorlauftemperatur",                   (n) => ({exp10: n-3 }),     "°C"                ], /* Flow Temperature */
				[ /^.10111(..)$/, "Rücklauftemperatur",                  (n) => ({exp10: n-3 }),     "°C"                ], /* Return Temperature */
				[ /^.11000(..)$/, "Temperaturdifferenz",                 (n) => ({exp10: n-3 }),     "K"                 ], /* Temperature Difference */
				[ /^.11001(..)$/, "Außentemperatur",                     (n) => ({exp10: n-3 }),     "°C"                ], /* External Temperature */
				[ /^.11010(..)$/, "Druck",                               (n) => ({exp10: n-3 }),     "bar"               ], /* Pressure */
				[ /^.1101110()$/, "Einheiten für Heizkostenverteiler",   null,                       null                ], /* Units for H.C.A. */
				[ /^.1101111()$/, "Reserviert",                          null,                       null                ], /* Reserved */
				[ /^.11100(..)$/, "Durchschnittliche Dauer",             1,                          getDurationUnit     ], /* Averaging Duration */
				[ /^.11101(..)$/, "Tatsächliche Dauer",                  1,                          getDurationUnit     ], /* Actuality Duration */
				[ /^.1111000()$/, "Fabrikationsnummer",                  null,                       null                ], /* Fabrication No */
				[ /^.1111010()$/, "Busadresse",                          null,                       null                ], /* Bus Address */
				[ /^.1101100()$/, "Datum",                               getDateTimeFunc(false),     null                ], /* Time Point date */
				[ /^.1101101()$/, "Zeitpunkt",                           getDateTimeFunc(true),      null                ], /* Time Point date + time */
		        [ /^.1111001()$/, "Erweiterte Identifikation",           null,                       null                ], /* Enhanced Identification Record, see Documentation p. 46 */
		        [ /^.1111111()$/, "Herstellerspezifisch",                null,                       null                ], /* Manufacturer Specific */
			];
			if(vif == 0b11111101) {
				vif = vife.shift();
				vif_patterns = [ /* VIF Extension 1 */
					[ /^.00000(..)$/, "Guthaben",                        (n) => ({exp10: n-3 }),     "Währungseinheit"   ],   /* Credit of 10nn-3 of the nominal local legal currency units */
					[ /^.00001(..)$/, "Schulden",                        (n) => ({exp10: n-3 }),     "Währungseinheit"   ],   /* Debit of 10nn-3 of the nominal local legal currency units */
					[ /^.0001000()$/, "Zugriffsnummer",                  null,                       null                ],   /* Access Number (transmission count) */
					[ /^.0001001()$/, "Medium",                          getMedium,                  null                ],   /* Medium (as in fixed header) */
					[ /^.0001010()$/, "Hersteller",                      getManufacturer,            null                ],   /* Manufacturer (as in fixed header) */
					[ /^.0001011()$/, "Parameter set identification",    null,                       null                ],   /* Parameter set identification */
					[ /^.0001100()$/, "Model / Version",                 null,                       null                ],   /* Model / Version */
					[ /^.0001101()$/, "Hardware Versionsnummer",         null,                       null                ],   /* Hardware version # */
					[ /^.0001110()$/, "Firmware Versionsnummer",         null,                       null                ],   /* Firmware version # */
					[ /^.0001111()$/, "Software Versionsnummer",         null,                       null                ],   /* Software version # */
					[ /^.0010000()$/, "Kundenort",                       null,                       null                ],   /* Customer location */
					[ /^.0010001()$/, "Kunde",                           null,                       null                ],   /* Customer */
					[ /^.0010010()$/, "Zugriffscode User",               null,                       null                ],   /* Access Code User */
					[ /^.0010011()$/, "Zugriffscode Operator",           null,                       null                ],   /* Access Code Operator */
					[ /^.0010100()$/, "Zugriffscode System Operator",    null,                       null                ],   /* Access Code System Operator */
					[ /^.0010101()$/, "Zugriffscode Developer",          null,                       null                ],   /* Access Code Developer */
					[ /^.0010110()$/, "Password",                        null,                       null                ],   /* Password */
					[ /^.0010111()$/, "Fehlerzeichen (binär)",           null,                       null                ],   /* Error flags (binary) */
					[ /^.0011000()$/, "Fehlermaske",                     null,                       null                ],   /* Error mask */
					[ /^.0011001()$/, "Reserviert",                      null,                       null                ],   /* Reserved */
					[ /^.0011010()$/, "Digital Output (binär)",          null,                       null                ],   /* Digital Output (binary) */
					[ /^.0011011()$/, "Digital Input (binär)",           null,                       null                ],   /* Digital Input (binary) */
					[ /^.0011100()$/, "Baudrate",                        1,                          "Baud"              ],   /* Baudrate [Baud] */
					[ /^.0011101()$/, "response delay time",             null,                       "bittimes"          ],   /* response delay time [bittimes] */
					[ /^.0011110()$/, "Retry",                           null,                       null                ],   /* Retry */
					[ /^.0011111()$/, "Reserviert",                      null,                       null                ],   /* Reserved */
					[ /^.0100000()$/, "Erste Speichernummer",            null,                       null                ],   /* First storage # for cyclic storage */
					[ /^.0100001()$/, "Letzte Speichernummer",           null,                       null                ],   /* Last storage # for cyclic storage */
					[ /^.0100010()$/, "Größe des Speicherblocks",        null,                       null                ],   /* Size of storage block */
					[ /^.0100011()$/, "Reserviert",                      null,                       null                ],   /* Reserved */
					[ /^.01001(..)$/, "Speicherungs-Zeitraum",           1,                          getDurationUnit     ],   /* Storage interval [sec..day] */
					[ /^.0101000()$/, "Speicherungs-Zeitraum",           1,                          durationUnits[4]    ],   /* Storage interval month(s) */
					[ /^.0101001()$/, "Speicherungs-Zeitraum",           1,                          durationUnits[5]    ],   /* Storage interval year(s) */
					[ /^.0101010()$/, "Reserviert",                      null,                       null                ],   /* Reserved */
					[ /^.0101011()$/, "Reserviert",                      null,                       null                ],   /* Reserved */
					[ /^.01011(..)$/, "Zeitraum seit letzter Auslesung", 1,                          getDurationUnit     ],   /* Duration since last readout [sec..days] */
					[ /^.0110000()$/, "Anfang der Abrechnungsperiode",   getDateTimeFunc(),          null                ],   /* Start (date/time) of tariff */
					[ /^.01100(..)$/, "Dauer der Abrechnungsperiode",    1,                          getDurationUnit     ],   /* Duration of tariff (nn=01 ..11: min to days) */
					[ /^.01101(..)$/, "Abrechnungsperiode",              1,                          getDurationUnit     ],   /* Period of tariff [sec to days] */
					[ /^.0111000()$/, "Abrechnungsperiode",              1,                          durationUnits[4]    ],   /* Period of tariff months */
					[ /^.0111001()$/, "Abrechnungsperiode",              1,                          durationUnits[5]    ],   /* Period of tariff years */
					[ /^.0111010()$/, "Dimensionslos",                   null,                       null                ],   /* dimensionless / no VIF */
					[ /^.0111011()$/, "Reserviert",                      null,                       null                ],   /* Reserved */
					[ /^.01111(..)$/, "Reserviert",                      null,                       null                ],   /* Reserved */
					[ /^.100(....)$/, "Spannung",                        (n) => ({exp10: n-9 }),     "V",                ],   /* 10nnnn-9 Volts */
					[ /^.101(....)$/, "Strom",                           (n) => ({exp10: n-12 }),    "A",                ],   /* 10nnnn-12 Ampere */
					[ /^.1100000()$/, "Reset Zähler",                    1,                          null                ],   /* Reset counter */
					[ /^.1100001()$/, "Kumulierter Zähler",              1,                          null                ],   /* Cumulation counter */
					[ /^.1100010()$/, "Kontrollsignal",                  null,                       null                ],   /* Control signal */
					[ /^.1100011()$/, "Wochentag",                       1,                          null                ],   /* Day of week */
					[ /^.1100100()$/, "Kalenderwoche",                   1,                          null                ],   /* Week number */
					[ /^.1100101()$/, "Time point of day change",        1,                          null                ],   /* Time point of day change */
					[ /^.1100110()$/, "State of parameter activation",   null,                       null                ],   /* State of parameter activation */
					[ /^.1100111()$/, "Special supplier information",    null,                       null                ],   /* Special supplier information */
					[ /^.11010(..)$/, "Dauer seit letzter Kulminierung", 1,                          getLongDurationUnit ],   /* Duration since last cumulation [hours..years] */
					[ /^.11011(..)$/, "Betriebszeit Battery",            1,                          getLongDurationUnit ],   /* Operating time battery [hours..years] */
					[ /^.1110000()$/, "Zeitpunkt des Batteriewechsels",  getDateTimeFunc(),          null                ],   /* Date and time of battery change */
				];
			}

			let vife_description = [];
			let vife_descriptions = [
				[ /^.1111110$/, "zukünftiger Wert" ],   /* future value */
			];
			while(vife.length) {
				let vife_byte = vife.shift();
				let vife_binary = vife_byte.toString(2).padStart(8, "0");
				let found = false;
				for(let [pattern, description] of vife_descriptions) {
					if(pattern.test(vife_binary)) {
						vife_description.push(description);
						found = true;
						break;
					}
				}
				if(!found) vife_description.push(`<${vife_byte.toString(16).toUpperCase()}>`);
			}
			vife_description = vife_description.join("");

			let vif_binary = vif.toString(2).padStart(8, "0");
			for(let [pattern, description, multiplier, unit] of vif_patterns) {
				let m;
				if((m = pattern.exec(vif_binary)) !== null) {
					let n = parseInt(m[1], 2);
					if(typeof description == "function") description = description(n);

					if(typeof multiplier == "function") multiplier = multiplier(n);
					if(typeof multiplier == "function") data = multiplier([data, data_bytes, data_len, drh]);
					else if(multiplier == null) data = data_bytes;
					else if(!data_isText) {
						if(typeof multiplier == "number" || multiplier.multiplier != null) data *= multiplier.multiplier ?? multiplier;
						if(multiplier.exp10) {
							if(multiplier.exp10 < 0) data = (data / (10 ** -multiplier.exp10)).toFixed(-multiplier.exp10);
							else data *= 10 ** multiplier.exp10;
						}
					}

					if(typeof unit == "function") unit = unit(n);

					dataName = description
						+ (vife_description ? ` (${vife_description})` : "")
						+ (dif_deviceNr ? ` ${dif_deviceNr + 1}.` : "")
						+ (dif_storageNr || dif_deviceNr ? (dif_deviceNr == 0 ? " " : "") + (dif_storageNr + 1) : "")
						+ (dif_tariffNr ? (dif_storageNr == 0 ? " " : "") + toLetterNumerals(dif_tariffNr) : "")
						+ (dif_functionFieldText ? ` (${dif_functionFieldText})` : "")
						+ (unit != null ? ` [${unit}]` : "");

					break;
				}
			}
		}

		if(dataName == null) {
			warn(`${warnPrefix}Unerwarteter Wert im VIF bzw. VIFE (Einheit/Multiplikator) <${vif_bytes}><${vife}>, Wert nicht implementiert!`);
			dataName = `<${drh}>`;
		}
		// dataName = `<${drh}>${dataName}`;

		let dataNameUnique, i = 1;
		while((dataNameUnique = dataName + (i > 1 ? `--${i}` : "")) in record) i++;
		record[dataNameUnique] = data;
		// record[dataNameUnique+"→databytes"] = data_bytes;
	}


	/* Check Sum */
	record.mbusChecksum = next();
	let calcedChecksum = decToHex(bytes.slice(4, -2).reduce((r, b) => (r + hexToDec(b)) % 256, 0));
	if(record.mbusChecksum != calcedChecksum) warn(`Checksumme <${record.mbusChecksum}> falsch, sollte <${calcedChecksum}> sein!`);
	record.telUID[2] = record.mbusChecksum;

	record.telUID = record.telUID.join("-");

	/* Stop */
	if(next() != "16") throw { msg: `Unerwartetes Stop-Byte <${currentBytes}>, <16> erwartet!`, record };


	if(nextIndex != bytes.length) warn(`Unerwartet noch ${bytes.length - nextIndex} Bytes nach dem Stop-Bit!`);

	return record;
}

/* parse a single XML file as uploaded by the IZAR Center Memory to a configured FTP server destination */
export function parseIzarXml(xmlContents) {
	let result = { records: [] };
	
	let mbusTels = [...xmlContents.matchAll(/(?:<MBTIME>([0-9A-Fa-f]+)<\/MBTIME>)?(?:\s*)(?:<ALMSTAT>[^<]*<\/ALMSTAT>)?(?:\s*)<MBTEL>([0-9A-Fa-f]+)<\/MBTEL>/g)];

	let telIndex = 0;
	for(let [, izarTime, mbusTel] of mbusTels) {
		telIndex++;
		try {
			let record = {};
			({ str: record.izarTimestr, timestamp: record.izarTimestamp } = parseMbusRawDate(izarTime));
			
			Object.assign(record, parseMbusTelegram(mbusTel));
			result.records.push(record);
		}
		catch(error) {
			(result.errors ??= []).push({
				telIndex,
				telUID: error.record?.telUID,
				mbusTel,
				error: error.msg || error.toString(),
				warnings: error.record?.warnings
			});
		}
	}

	return result;
}
