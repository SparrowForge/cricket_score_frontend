export interface MatchListItem {
  id: string;
  match_number: number | null;
  stage: string;
  stage_label: string | null;
  status: string;
  scheduled_start: string;
  result_summary: string | null;
  tournament_id: string | null;
  tournament_name: string | null;
  winner_team_id: string | null;
  team_a_id: string; team_a: string; team_a_short: string; team_a_logo: string | null;
  team_b_id: string; team_b: string; team_b_short: string; team_b_logo: string | null;
  team_a_runs: number | null; team_a_wickets: number | null; team_a_balls: number | null;
  team_b_runs: number | null; team_b_wickets: number | null; team_b_balls: number | null;
  wickets_to_fall: number | null;
  venue: string | null;
  live_summary: { batting_team?: string; score?: string; overs?: string; target?: number | null } | null;
}

export interface MatchDetail {
  id: string;
  status: string;
  scheduled_start: string;
  result_summary: string | null;
  result_type: string | null;
  win_margin: { by: string; value?: number } | null;
  toss_winner_id: string | null;
  toss_decision: string | null;
  dls_applied: boolean;
  is_super_over: boolean;
  parent_match_id: string | null;
  tournament_id: string | null;
  tournament_name: string | null;
  tournament_slug: string | null;
  venue_name: string | null;
  team_a_id: string; team_a_name: string; team_a_short: string; team_a_logo: string | null;
  team_b_id: string; team_b_name: string; team_b_short: string; team_b_logo: string | null;
  player_of_match_id: string | null;
  player_of_match_name: string | null;
  rules_snapshot: Record<string, unknown> | null;
  innings: InningsRow[];
  child_matches: { id: string; stage_label: string; status: string; result_summary: string | null }[];
  officials: { duty: string; id: string; full_name: string }[];
}

export interface InningsRow {
  id: string;
  seq: number;
  batting_team_id: string;
  bowling_team_id: string;
  batting_team: string;
  bowling_team: string;
  status: string;
  is_follow_on: boolean;
  target_runs: number | null;
  max_overs: string | null;
  total_runs: number;
  total_wickets: number;
  legal_balls: number;
  extras_wides: number; extras_no_balls: number; extras_byes: number; extras_leg_byes: number; extras_penalty: number;
}

export interface SquadPlayer {
  team_id: string; team: string;
  player_id: string; full_name: string; primary_role: string;
  is_playing_xi: boolean; is_twelfth: boolean; can_bat: boolean; can_bowl: boolean;
  is_captain: boolean; is_wicket_keeper: boolean; batting_order: number | null;
}

export interface Tournament {
  id: string; name: string; slug: string; season: string | null; status: string;
  start_date: string | null; end_date: string | null; banner_url: string | null;
  organization_id: string; format: string; format_slug: string;
  team_count: number; match_count: number;
}

export interface PointsRow {
  team_id: string; team_name: string; short_name: string; logo_url: string | null; group_name: string | null;
  played: number; won: number; lost: number; tied: number; no_result: number;
  points: number; net_run_rate: string; rank: number | null;
}

export interface Org {
  id: string; name: string; slug: string; logo_url: string | null;
  is_owner: boolean; plan: string | null; owner_user_id?: string;
}

export interface SquadMember {
  id: string; full_name: string; primary_role: string;
  jersey_number: number | null; is_captain: boolean; is_wicket_keeper: boolean;
}

export interface Team {
  id: string; name: string; short_name: string; slug: string; logo_url: string | null;
  primary_color?: string | null; home_venue_id?: string | null;
  squad_size?: number;
  squad?: SquadMember[];
}

export interface Player {
  id: string; full_name: string; display_name?: string | null; primary_role: string;
  batting_style: string | null; bowling_style: string | null; photo_url: string | null;
  country?: string | null; date_of_birth?: string | null;
  height_cm?: number | null; major_teams?: string[]; bio?: string | null;
}

export interface PlayerCareerStat {
  format_family: string; matches_played: number;
  innings_batted: number; runs_scored: number; balls_faced: number; not_outs: number;
  highest_score: number; fifties: number; hundreds: number; fours: number; sixes: number;
  innings_bowled: number; balls_bowled: number; runs_conceded: number; wickets_taken: number;
  best_bowling: { wickets: number; runs: number } | null; five_wkt_hauls: number;
  catches: number; stumpings: number; run_outs: number;
}

export interface PlayerProfile extends Player {
  career_stats: PlayerCareerStat[];
  recent_matches: {
    match_id: string; runs_scored: number; balls_faced: number;
    wickets_taken: number; runs_conceded: number; scheduled_start: string; result_summary: string | null;
  }[];
  teams: { id: string; name: string; short_name: string; logo_url: string | null }[];
}

export interface Venue {
  id: string; name: string; city: string | null; country: string | null;
  capacity: number | null; image_url: string | null; organization_id: string | null;
}

export const calcAge = (dob: string): number => {
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return age;
};

export const fmtHeight = (cm: number): string => {
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${cm} cm (${feet}'${inches}")`;
};

export const oversFromBalls = (balls: number, bpo = 6) => `${Math.floor(balls / bpo)}.${balls % bpo}`;

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
