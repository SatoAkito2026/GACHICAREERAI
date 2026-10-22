-- 人物まとめを「企業に公開中の面接だけ」から作り直す（毎時の処理で順に更新される）
update public.candidate_profiles
set summary_stale = true
where summary is not null;
