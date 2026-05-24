
update public.rollout_config set
  green_max_paused_ratio = 0.99,
  green_max_delegated_ratio = 0.99,
  green_min_turns_24h = 5
where id = true;

-- Rafael volta para dark (foi rebaixado por falso-positivo)
update public.consultants
  set flow_engine_v3 = 'dark', flow_reliability_v2 = 'dark'
where id = '0c2711ad-4836-41e6-afba-edd94f698ae3';

insert into public.rollout_audit (consultant_id, flag_kind, from_state, to_state, reason)
values ('0c2711ad-4836-41e6-afba-edd94f698ae3','flow_engine_v3','off','dark','restore_after_gate_tuning');
