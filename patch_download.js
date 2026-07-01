const fs = require('fs');
const file = 'src/app/api/download/route.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `  if (!result.success) {
    const details = result.body;
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(details),
        details,
      },
      { status: result.status || 500 },
    );
  }`;

const replacement = `  if (!result.success) {
    const details = result.body;
    const errorMsg = getErrorMessage(details);
    if (errorMsg.includes("redis") || errorMsg.includes("Test in Redis") || errorMsg.includes("fetch question paper")) {
      return NextResponse.json(
        {
          success: false,
          message: "Skipped: Paper is subjective or unavailable on Testbook.",
          details,
        },
        { status: result.status || 500 },
      );
    }
    return NextResponse.json(
      {
        success: false,
        message: errorMsg,
        details,
      },
      { status: result.status || 500 },
    );
  }`;

code = code.replace(target, replacement);
fs.writeFileSync(file, code);
