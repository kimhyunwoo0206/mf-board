'use strict';
// 현장 작업지시서·기간 집계가 함께 쓰는 품목군 순서와 현장 표시명입니다.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MfGroups=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const catalog=[
 {group:'오징어',items:['손질오징어(통) 500g','손질오징어(통) 900g','손질오징어(할복) 500g','손질오징어(할복) 900g']},
 {group:'백조기',items:['손질 백조기 500g 1개','손질 백조기 900g 1개']},
 {group:'고등어',items:['손질 고등어 500g','손질 고등어 900g','토막고등어 800g','토막고등어 1kg']},
 {group:'홍합',items:['생물 홍합 1kg','생물 홍합 3kg']},
 {group:'물바지락',items:['생물 물바지락 700g 1개','생물 물바지락 1kg 1개']},
 {group:'황돔',items:['손질 황돔 500g 1개','손질 황돔 900g 1개']},
 {group:'새우',items:['활새우 800g','활새우 1.2kg','보리새우 600g','보리새우 1.2kg']},
 {group:'대합',items:['생물 대합 600g 1개','생물 대합 1kg 1개']},
 {group:'뿔소라',items:['생물 뿔소라 600g','생물 뿔소라 1kg']},
 {group:'돌멍게',items:['생물 돌멍게 400g','생물 돌멍게 1kg']},
 {group:'통영생굴',items:['[로켓프레시] 위드프레쉬 산지직송 통영 생굴 800g','[로켓프레시] 위드프레쉬 산지직송 통영 생굴 1kg','[로켓프레시] 위드프레쉬 산지직송 통영 생굴 2kg','[로켓프레시] 위드프레쉬 산지직송 통영 생굴 3kg','[로켓프레시] 위드프레쉬 산지직송 통영 생굴 5kg']}
 ];
 const displayNames={'[로켓프레시] 위드프레쉬 산지직송 통영 생굴 800g':'통영생굴 800g','[로켓프레시] 위드프레쉬 산지직송 통영 생굴 1kg':'통영생굴 1kg','[로켓프레시] 위드프레쉬 산지직송 통영 생굴 2kg':'통영생굴 2kg','[로켓프레시] 위드프레쉬 산지직송 통영 생굴 3kg':'통영생굴 3kg','[로켓프레시] 위드프레쉬 산지직송 통영 생굴 5kg':'통영생굴 5kg'};
 return {catalog,displayNames};
});
