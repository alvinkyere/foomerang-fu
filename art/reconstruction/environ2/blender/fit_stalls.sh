#!/bin/sh
# Post tops (image px) per stall, in order: front-left, front-right, back-right, back-left (as seen facing the stall's front, its
# counter and rug side). The side stalls open toward the plaza (east / west), the angled ones toward the fountain, the far ones south.
M="$1"; PY="$2"
"$PY" fit_stalls_joint.py "$M" stall_fit_near.json near \
  "09_stall_sw:stall_sw:266,423;278,358;205,360;192,433" \
  "10_stall_se:stall_se:1025,358;1037,423;1110,433;1098,360" \
  "07_stall_l:stall_nw:389,248;444,215;402,163;345,213" \
  "08_stall_r:stall_ne:859,215;914,248;958,213;901,163"
"$PY" fit_stalls_joint.py "$M" stall_fit_far.json far \
  "05_stall_far_l:stall_far_w:105,72;204,75;203,32;113,32" \
  "06_stall_far_r:stall_far_e:1099,75;1198,72;1190,32;1100,32"
