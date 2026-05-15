import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideTransition, type Intent, type ConversationalStep } from "./state-machine.ts";

// Table-driven test: every (step, intent) → expected nextStep.
const cases: Array<[ConversationalStep, Intent, string]> = [
  // Universal overrides
  ["welcome", "quer_cadastrar", "aguardando_conta"],
  ["menu_inicial", "quer_cadastrar", "aguardando_conta"],
  ["qualificacao", "quer_cadastrar", "aguardando_conta"],
  ["pos_video", "quer_cadastrar", "aguardando_conta"],
  ["checkin_pos_video", "quer_cadastrar", "aguardando_conta"],
  ["pitch_conexao_club", "quer_cadastrar", "aguardando_conta"],
  ["duvidas_pos_club", "quer_cadastrar", "aguardando_conta"],
  ["welcome", "quer_humano", "aguardando_humano"],
  ["checkin_pos_video", "quer_humano", "aguardando_humano"],

  // welcome
  ["welcome", "saudacao", "qualificacao"],
  ["welcome", "afirmacao", "qualificacao"],
  ["welcome", "outro", "welcome"],

  // menu_inicial
  ["menu_inicial", "afirmacao", "qualificacao"],
  ["menu_inicial", "negacao", "menu_inicial"],
  ["menu_inicial", "outro", "menu_inicial"],

  // qualificacao
  ["qualificacao", "ja_assistiu_video", "checkin_pos_video"],
  ["qualificacao", "outro", "qualificacao"],

  // pos_video / checkin_pos_video
  ["pos_video", "afirmacao", "pitch_conexao_club"],
  ["checkin_pos_video", "afirmacao", "pitch_conexao_club"],
  ["checkin_pos_video", "tem_duvida", "duvidas_pos_club"],
  ["checkin_pos_video", "negacao", "checkin_pos_video"],
  ["checkin_pos_video", "outro", "checkin_pos_video"],

  // pitch_conexao_club → always to duvidas_pos_club after video
  ["pitch_conexao_club", "outro", "duvidas_pos_club"],
  ["pitch_conexao_club", "afirmacao", "duvidas_pos_club"],

  // duvidas_pos_club
  ["duvidas_pos_club", "afirmacao", "aguardando_conta"],
  ["duvidas_pos_club", "negacao", "duvidas_pos_club"],
  ["duvidas_pos_club", "tem_duvida", "duvidas_pos_club"],

  // aguardando_humano: stays put
  ["aguardando_humano", "outro", "aguardando_humano"],
  ["aguardando_humano", "saudacao", "aguardando_humano"],
];

for (const [step, intent, expected] of cases) {
  Deno.test(`decideTransition(${step}, ${intent}) → ${expected}`, () => {
    const t = decideTransition(step, intent);
    assertEquals(t.nextStep, expected);
  });
}

Deno.test("send_template action carries step_key and template_key", () => {
  const t = decideTransition("checkin_pos_video", "tem_duvida");
  assertEquals(t.action.type, "send_template");
  if (t.action.type === "send_template") {
    assertEquals(t.action.step_key, "duvidas_pos_club");
    assertEquals(t.action.template_key, "pode_perguntar");
  }
});

Deno.test("entering cadastro uses pedir_conta template", () => {
  const t = decideTransition("checkin_pos_video", "quer_cadastrar");
  assertEquals(t.nextStep, "aguardando_conta");
  if (t.action.type === "send_template") {
    assertEquals(t.action.template_key, "pedir_conta");
  }
});
