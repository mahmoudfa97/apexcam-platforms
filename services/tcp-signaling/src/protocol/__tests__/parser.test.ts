import { ProtocolParser } from "../parser"

describe("ProtocolParser", () => {
  let parser: ProtocolParser

  beforeEach(() => {
    parser = new ProtocolParser()
  })

  test("should parse V101 registration message", () => {
    const message =
      "$$dc0227,20,V101,00007,,180903 094112,A0010,114,3,341826000,22,40,236220000,0.00,7000,000E00010101D383,0000000000000000,0.00,0.00,0.00,0,0.00,67,0|0.00|0|0|0|0|0|0|0,,V1.0.0.1,4108,,0,0,0,123,2,,1,1,2,101,,D2017120781,V6.1.45 20160519,#"

    const messages = parser.parse(Buffer.from(message))

    expect(messages).toHaveLength(1)
    expect(messages[0].command).toBe("V101")
    expect(messages[0].deviceSerial).toBe("00007")
    expect(messages[0].fields.protocolVersion).toBe("V1.0.0.1")
    expect(messages[0].fields.licensePlate).toBe("123")
  })

  test("should parse V109 heartbeat message", () => {
    const message = "$$dc0029,13,V109,00007,,180903 110250#"

    const messages = parser.parse(Buffer.from(message))

    expect(messages).toHaveLength(1)
    expect(messages[0].command).toBe("V109")
    expect(messages[0].deviceSerial).toBe("00007")
  })

  test("should parse V114 location report", () => {
    const message =
      "$$dc0165,192,V114,00007,,180903 135949,A0010,114,3,338214000,22,40,220920000,0.00,1521000,000E00010101D383,0000000000000000,0.00,0.00,0.00,0,0.00,2266,0|0.00|0|0|0|0|0|0|0,1#"

    const messages = parser.parse(Buffer.from(message))

    expect(messages).toHaveLength(1)
    expect(messages[0].command).toBe("V114")
    expect(messages[0].fields.locationAndStatus).toBeDefined()
    expect(messages[0].fields.locationAndStatus.gpsValid).toBe(true)
    expect(messages[0].fields.driveFlag).toBe(1)
  })

  test("should parse V201 alarm start", () => {
    const message =
      "$$dc0203,8,V201,2014,,180904 104340,A0010,114,3,338100000,22,40,207299999,0.00,1077700,0D0000020101D783,0000000000000000,0.00,0.00,0.00,0,0.00,1092,0|0.00|0|0|0|0|0|0|0,,180904 104340,A4362779F6557409,0,,0,,2,0,#"

    const messages = parser.parse(Buffer.from(message))

    expect(messages).toHaveLength(1)
    expect(messages[0].command).toBe("V201")
    expect(messages[0].deviceSerial).toBe("2014")
    expect(messages[0].fields.alarmUid).toBe("A4362779F6557409")
  })

  test("should handle multiple messages in buffer", () => {
    const message1 = "$$dc0029,13,V109,00007,,180903 110250#"
    const message2 = "$$dc0029,14,V109,00007,,180903 110251#"

    const messages = parser.parse(Buffer.from(message1 + message2))

    expect(messages).toHaveLength(2)
    expect(messages[0].serial).toBe(13)
    expect(messages[1].serial).toBe(14)
  })

  test("should handle partial messages", () => {
    const partialMessage = "$$dc0029,13,V109,00"
    const remainingMessage = "007,,180903 110250#"

    let messages = parser.parse(Buffer.from(partialMessage))
    expect(messages).toHaveLength(0)

    messages = parser.parse(Buffer.from(remainingMessage))
    expect(messages).toHaveLength(1)
    expect(messages[0].deviceSerial).toBe("00007")
  })

  test("should convert GPS coordinates correctly", () => {
    const message =
      "$$dc0165,192,V114,00007,,180903 135949,A0010,114,3,338214000,22,40,220920000,0.00,1521000,000E00010101D383,0000000000000000,0.00,0.00,0.00,0,0.00,2266,0|0.00|0|0|0|0|0|0|0,1#"

    const messages = parser.parse(Buffer.from(message))
    const location = messages[0].fields.locationAndStatus

    expect(location.longitude).toBeCloseTo(114.056, 3)
    expect(location.latitude).toBeCloseTo(22.67, 3)
  })

  test("should build C100 response correctly", () => {
    const response = parser.buildResponse("C100", "00007", "", ["V101", "180903 094112", "0", "1", "1"])

    expect(response).toContain("$$dc")
    expect(response).toContain("C100")
    expect(response).toContain("00007")
    expect(response).toContain("#")
  })
})
