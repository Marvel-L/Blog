package store

import "testing"

func TestPasswordHash(t *testing.T) {
	const password = "test-password-strong"
	first, err := PasswordHash(password)
	if err != nil {
		t.Fatal(err)
	}
	second, err := PasswordHash(password)
	if err != nil {
		t.Fatal(err)
	}
	if first == second || !VerifyPassword(first, password) || VerifyPassword(first, "wrong-password") || VerifyPassword("invalid", password) {
		t.Fatal("password verification or salt failure")
	}
	for _, s := range []string{"", "short", string([]byte{0xff})} {
		if ValidPassword(s) {
			t.Fatal("invalid password accepted")
		}
	}
	for _, s := range []string{"aa", "has space", "../admin", "<script>"} {
		if ValidUsername(s) {
			t.Fatal("invalid username accepted")
		}
	}
	if !ValidUsername("Test_User-1") || !ValidPassword("abcdefgh") {
		t.Fatal("valid credential rejected")
	}
}
